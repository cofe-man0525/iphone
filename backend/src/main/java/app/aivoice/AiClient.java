package app.aivoice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

@Component public class AiClient {
    private final String url,token;private final int timeout;private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
    public AiClient(@Value("${aivoice.ai-url}") String url,@Value("${aivoice.ai-token}") String token,@Value("${aivoice.timeout-seconds}") int timeout,ObjectMapper json){this.url=url.replaceAll("/+$","");this.token=token;this.timeout=timeout;this.json=json;}
    record Audio(byte[] bytes,double duration){}
    public Map<String,Object> health(){
        try{var req=HttpRequest.newBuilder(URI.create(url+"/internal/health")).header("Authorization","Bearer "+token).timeout(Duration.ofSeconds(5)).GET().build();var res=http.send(req,HttpResponse.BodyHandlers.ofByteArray());check(res);return json.readValue(res.body(),Map.class);}
        catch(Exception e){return Map.of("ready",false,"error",e instanceof Api.Fault?e.getMessage():"无法连接内部AI服务，请检查配置与进程。");}
    }
    private void check(HttpResponse<byte[]> response)throws IOException{
        if(response.statusCode()>=200&&response.statusCode()<300)return;
        JsonNode detail=json.readTree(response.body()).path("detail");String message=detail.isObject()?detail.path("message").asText():detail.asText();
        throw new Api.Fault(response.statusCode()==401?502:response.statusCode(),detail.path("code").asText("AI_SERVICE_ERROR"),message.isBlank()?"AI服务请求失败。":message);
    }
    private HttpResponse<byte[]> post(String path,Map<String,byte[]> files,Map<String,String> fields,int seconds)throws IOException,InterruptedException{
        if(token.isBlank())throw new Api.Fault(503,"AI_TOKEN_NOT_CONFIGURED","业务后端未配置AI服务内部Token。");
        String boundary="AIVoice"+UUID.randomUUID().toString().replace("-","");ByteArrayOutputStream out=new ByteArrayOutputStream();
        for(var file:files.entrySet()){out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+file.getKey()+"\"; filename=\"audio.wav\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));out.write(file.getValue());out.write("\r\n".getBytes(StandardCharsets.UTF_8));}
        for(var field:fields.entrySet())out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+field.getKey()+"\"\r\n\r\n"+field.getValue()+"\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(("--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
        var req=HttpRequest.newBuilder(URI.create(url+path)).header("Authorization","Bearer "+token).header("Content-Type","multipart/form-data; boundary="+boundary).timeout(Duration.ofSeconds(seconds)).POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())).build();
        var response=http.send(req,HttpResponse.BodyHandlers.ofByteArray());check(response);return response;
    }
    public Audio normalize(byte[] input,String kind){try{var response=post("/internal/normalize",Map.of("audio",input),Map.of("kind",kind),45);return new Audio(response.body(),Double.parseDouble(response.headers().firstValue("X-Audio-Duration").orElseThrow()));}catch(InterruptedException e){Thread.currentThread().interrupt();throw new Api.Fault(503,"INTERRUPTED","音频校验被中断，请重试。");}catch(IOException e){throw new Api.Fault(502,"AI_UNAVAILABLE","AI音频校验服务不可用，请检查内部服务。");}}
    public byte[] convert(byte[] source,byte[] reference,String format)throws IOException,InterruptedException{return post("/internal/convert",Map.of("audio",source,"reference",reference),Map.of("format",format),timeout).body();}
}
