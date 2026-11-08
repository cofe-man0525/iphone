package app.aivoice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Business/HTTP contract tests with a transport stub. This is NOT a model inference test. */
@SpringBootTest @AutoConfigureMockMvc @TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ApiIntegrationTest {
    static final String AUTH="Bearer integration-test-token";
    static HttpServer transport;static volatile boolean failConversion=false;
    @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired Storage storage;
    static String voiceId,taskId;
    static byte[] wave(){byte[] b=new byte[44+22050*2*4];java.nio.ByteBuffer v=java.nio.ByteBuffer.wrap(b).order(java.nio.ByteOrder.LITTLE_ENDIAN);v.put("RIFF".getBytes()).putInt(b.length-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(22050).putInt(44100).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(b.length-44);return b;}
    @DynamicPropertySource static void settings(DynamicPropertyRegistry r)throws Exception{
        Path data=Files.createTempDirectory(Path.of("target"),"api-test-");
        transport=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        transport.createContext("/internal/health",exchange->{byte[] body="{\"ready\":false,\"error\":\"Test transport only\"}".getBytes();exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();});
        transport.createContext("/internal/normalize",exchange->{exchange.getRequestBody().readAllBytes();exchange.getResponseHeaders().set("X-Audio-Duration","4.0");byte[] body=wave();exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();});
        transport.createContext("/internal/convert",exchange->{exchange.getRequestBody().readAllBytes();byte[] body=failConversion?"{\"detail\":{\"code\":\"MODEL_NOT_READY\",\"message\":\"模型未加载（测试故障）\"}}".getBytes(java.nio.charset.StandardCharsets.UTF_8):wave();exchange.sendResponseHeaders(failConversion?503:200,body.length);exchange.getResponseBody().write(body);exchange.close();});transport.start();
        r.add("aivoice.data-dir",()->data.toAbsolutePath().toString());r.add("aivoice.api-token",()->"integration-test-token");r.add("aivoice.ai-token",()->"internal-test-token");r.add("aivoice.ai-url",()->"http://127.0.0.1:"+transport.getAddress().getPort());
    }
    @AfterAll static void close(){transport.stop(0);}
    @Test @Order(1) void authenticationAndDisabledCategories()throws Exception{
        mvc.perform(get("/api/health")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(get("/api/health").header("Authorization",AUTH)).andExpect(status().isOk()).andExpect(jsonPath("$.data.ai.ready").value(false));
        mvc.perform(get("/api/voices").header("Authorization",AUTH)).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(7)).andExpect(jsonPath("$.data[0].available").value(false));
        mvc.perform(get("/api/tasks/../../secret").header("Authorization",AUTH)).andExpect(status().isNotFound());
        mvc.perform(get("/api/tasks/not-a-uuid").header("Authorization",AUTH)).andExpect(status().isBadRequest());
    }
    @Test @Order(2) void legalReferenceAndConversionContract()throws Exception{
        var file=new MockMultipartFile("reference","reference.wav","audio/wav",wave());
        mvc.perform(multipart("/api/voices").file(file).param("name","测试参考").param("authorized","false").header("Authorization",AUTH)).andExpect(status().isBadRequest());
        var response=mvc.perform(multipart("/api/voices").file(file).param("name","测试参考").param("authorized","true").header("Authorization",AUTH)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        voiceId=json.readTree(response).path("data").path("id").asText();
        mvc.perform(get("/api/voices/"+voiceId+"/audio").header("Authorization",AUTH)).andExpect(status().isOk()).andExpect(content().contentType("audio/wav"));
        taskId=submit();Models.Task task=await(taskId);assertThat(task.status).isEqualTo("SUCCEEDED");
        mvc.perform(get("/api/tasks/"+taskId+"/audio").header("Authorization",AUTH)).andExpect(status().isOk()).andExpect(content().contentType("audio/wav")).andExpect(content().bytes(wave()));
        assertThat(Files.readString(storage.taskFolder(taskId).resolve("task.json"))).doesNotContain("integration-test-token","internal-test-token");
    }
    String submit()throws Exception{var response=mvc.perform(multipart("/api/convert").file(new MockMultipartFile("audio","a.wav","audio/wav",wave())).param("voiceId",voiceId).param("format","wav").header("Authorization",AUTH)).andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();return json.readTree(response).path("data").path("id").asText();}
    Models.Task await(String id)throws Exception{for(int i=0;i<100;i++){Models.Task task=storage.task(id);if(!task.active())return task;Thread.sleep(50);}throw new AssertionError("Task timed out");}
    @Test @Order(3) void realFailuresDoNotCreateSuccessfulResults()throws Exception{
        failConversion=true;String failed=submit();var task=await(failed);assertThat(task.status).isEqualTo("FAILED");assertThat(task.error).contains("模型未加载");
        mvc.perform(get("/api/tasks/"+failed+"/audio").header("Authorization",AUTH)).andExpect(status().isConflict());
        mvc.perform(delete("/api/tasks/"+failed).header("Authorization",AUTH)).andExpect(status().isOk());assertThat(Files.exists(storage.taskFolder(failed))).isFalse();failConversion=false;
    }
    @Test @Order(4) void restartRestoresMetadataAndMarksInterruptedTasks()throws Exception{
        Path directory=Files.createTempDirectory(Path.of("target"),"restart-test-");ObjectMapper mapper=json.copy();String id=java.util.UUID.randomUUID().toString();
        try(Storage first=new AutoClosingStorage(directory.toString(),mapper)){var voice=new Models.Voice(voiceId,"参考","自定义音色","",true,true,null,java.time.Instant.now());first.add(voice,wave());Files.createDirectories(first.taskFolder(id));first.add(new Models.Task(id,voice,"wav",4));}
        try(Storage second=new AutoClosingStorage(directory.toString(),mapper)){assertThat(second.voice(voiceId).name()).isEqualTo("参考");assertThat(second.task(id).status).isEqualTo("FAILED");assertThat(second.task(id).error).contains("重启");}
    }
    static class AutoClosingStorage extends Storage implements AutoCloseable{AutoClosingStorage(String dir,ObjectMapper json)throws java.io.IOException{super(dir,json);}}
    @Test @Order(5) void deleteRemovesTaskAndVoiceFiles()throws Exception{
        mvc.perform(delete("/api/tasks/"+taskId).header("Authorization",AUTH)).andExpect(status().isOk());
        mvc.perform(get("/api/tasks/"+taskId).header("Authorization",AUTH)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/voices/"+voiceId).header("Authorization",AUTH)).andExpect(status().isOk());assertThat(Files.exists(storage.voiceFile(voiceId))).isFalse();
    }
}
