package app.aivoice;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.file.Files;
import java.time.Instant;
import java.util.*;
import static app.aivoice.Models.*;

@RestController @RequestMapping("/api") @Validated public class Controller {
    private final Storage store;private final AiClient ai;private final ConversionService conversion;
    public Controller(Storage store,AiClient ai,ConversionService conversion){this.store=store;this.ai=ai;this.conversion=conversion;}
    private byte[] bytes(MultipartFile file)throws IOException{if(file.isEmpty())throw new Api.Fault(400,"EMPTY_AUDIO","音频文件为空。");if(file.getSize()>20*1024*1024)throw new Api.Fault(413,"FILE_TOO_LARGE","音频不能超过20MB。");return file.getBytes();}
    @GetMapping("/health") public Api.Result<?> health(){return Api.ok(Map.of("version","1.0.0","ai",ai.health()));}
    @GetMapping("/voices") public Api.Result<List<Voice>> voices(){List<Voice> result=new ArrayList<>();for(int i=0;i<7;i++)result.add(new Voice("category-"+i,CATEGORIES.get(i),CATEGORIES.get(i),"导入授权参考录音后可用",false,false,null,null));result.addAll(store.voices.values().stream().sorted(Comparator.comparing(Voice::created)).toList());return Api.ok(result);}
    @PostMapping("/voices") public Api.Result<Voice> addVoice(@RequestPart("reference") MultipartFile reference,@RequestParam @NotBlank @Size(max=40) String name,@RequestParam(defaultValue="自定义音色") String category,@RequestParam boolean authorized)throws IOException{
        if(!authorized)throw new Api.Fault(400,"AUTHORIZATION_REQUIRED","请确认你拥有参考录音的使用权。");if(!CATEGORIES.contains(category))throw new Api.Fault(400,"INVALID_CATEGORY","请选择有效的音色分类。");
        AiClient.Audio audio=ai.normalize(bytes(reference),"reference");String id=UUID.randomUUID().toString();Voice voice=new Voice(id,name.trim(),category,"授权参考录音 · "+Math.round(audio.duration())+"秒",true,true,"/api/voices/"+id+"/audio",Instant.now());store.add(voice,audio.bytes());return Api.ok(voice);
    }
    @GetMapping("/voices/{id}/audio") public ResponseEntity<FileSystemResource> preview(@PathVariable String id){store.voice(id);return ResponseEntity.ok().contentType(MediaType.parseMediaType("audio/wav")).header("Content-Disposition","inline; filename=reference.wav").body(new FileSystemResource(store.voiceFile(id)));}
    @DeleteMapping("/voices/{id}") public Api.Result<?> deleteVoice(@PathVariable String id)throws IOException{store.deleteVoice(id);return Api.ok(Map.of("deleted",true));}
    @PostMapping("/convert") public ResponseEntity<Api.Result<Task>> convert(@RequestPart("audio") MultipartFile audio,@RequestParam String voiceId,@RequestParam(defaultValue="m4a") String format)throws IOException{return ResponseEntity.accepted().body(Api.ok(conversion.create(bytes(audio),voiceId,format)));}
    @GetMapping("/tasks/{id}") public Api.Result<Task> task(@PathVariable String id){return Api.ok(store.task(id));}
    @GetMapping("/tasks/{id}/audio") public ResponseEntity<FileSystemResource> result(@PathVariable String id){Task task=store.task(id);if(!"SUCCEEDED".equals(task.status))throw new Api.Fault(409,"TASK_NOT_READY","转换尚未完成，或本次转换未成功。");var path=store.taskFolder(id).resolve("result."+task.format);if(!Files.isRegularFile(path))throw new Api.Fault(410,"AUDIO_MISSING","结果文件已清理，请重新转换。");return ResponseEntity.ok().contentType(MediaType.parseMediaType("m4a".equals(task.format)?"audio/mp4":"audio/wav")).header("Content-Disposition","attachment; filename=aivoice."+task.format).body(new FileSystemResource(path));}
    @DeleteMapping("/tasks/{id}") public Api.Result<?> deleteTask(@PathVariable String id)throws IOException{conversion.delete(id);return Api.ok(Map.of("deleted",true));}
}
