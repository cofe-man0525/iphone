package app.aivoice;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.nio.file.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import static app.aivoice.Models.*;

@Service public class ConversionService {
    private final Storage store;private final AiClient ai;private final int retention;
    private final ThreadPoolExecutor executor=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(8),r->new Thread(r,"aivoice-convert"),new ThreadPoolExecutor.AbortPolicy());
    private final Map<String,Future<?>> running=new ConcurrentHashMap<>();
    public ConversionService(Storage store,AiClient ai,@Value("${aivoice.retention-days}") int retention){this.store=store;this.ai=ai;this.retention=Math.max(1,retention);}
    public synchronized Task create(byte[] input,String voiceId,String format)throws IOException{
        Voice voice=store.voice(voiceId);if(!voice.available())throw new Api.Fault(409,"VOICE_UNAVAILABLE","此音色没有可用的授权参考录音。");
        if(!List.of("m4a","wav").contains(format))throw new Api.Fault(400,"INVALID_FORMAT","输出格式仅支持m4a或wav。");
        if(executor.getQueue().remainingCapacity()==0)throw new Api.Fault(429,"QUEUE_FULL","等待任务较多，请稍后重试。");
        AiClient.Audio audio=ai.normalize(input,"source");String id=UUID.randomUUID().toString();Path folder=store.taskFolder(id);Files.createDirectories(folder);
        Task task=new Task(id,voice,format,audio.duration());
        try{Files.write(folder.resolve("source.wav"),audio.bytes());Files.copy(store.voiceFile(voiceId),folder.resolve("reference.wav"));store.add(task);FutureTask<Void> future=new FutureTask<>(()->{execute(task);return null;});running.put(id,future);executor.execute(future);return task;}
        catch(Exception e){running.remove(id);store.forgetTask(id);store.deleteTaskFiles(id);throw e;}
    }
    private void execute(Task task){
        try{
            if(!store.tasks.containsKey(task.id)||Thread.currentThread().isInterrupted())return;
            task.status="RUNNING";store.save(task);Path folder=store.taskFolder(task.id);
            byte[] result=ai.convert(Files.readAllBytes(folder.resolve("source.wav")),Files.readAllBytes(folder.resolve("reference.wav")),task.format);
            if(!store.tasks.containsKey(task.id)||Thread.currentThread().isInterrupted())return;
            if(result.length<44)throw new IOException("AI returned an empty audio file");
            Path next=folder.resolve("result.next");Files.write(next,result);Files.move(next,folder.resolve("result."+task.format),StandardCopyOption.REPLACE_EXISTING);
            task.status="SUCCEEDED";store.save(task);
        }catch(Exception e){
            task.status="FAILED";task.error=e instanceof Api.Fault?e.getMessage():e instanceof HttpTimeoutException?"AI推理超时，请缩短录音或检查服务器资源后重试。":e instanceof InterruptedException?"任务已取消或服务正在关闭。":"AI服务调用失败，请检查内部推理服务与日志。";
            try{store.save(task);}catch(IOException write){org.slf4j.LoggerFactory.getLogger(getClass()).error("Cannot persist task {}",task.id);}
            org.slf4j.LoggerFactory.getLogger(getClass()).warn("Task {} failed: {}",task.id,e.getClass().getSimpleName());
            if(e instanceof InterruptedException)Thread.currentThread().interrupt();
        }finally{running.remove(task.id);if(!store.tasks.containsKey(task.id))try{store.deleteTaskFiles(task.id);}catch(IOException ignored){}}
    }
    public synchronized void delete(String id)throws IOException{
        Task task=store.task(id);task.status="CANCELLED";store.forgetTask(id);Future<?> future=running.remove(id);if(future!=null)future.cancel(true);
        // Worker also retries cleanup in finally if a file was still being read.
        try{store.deleteTaskFiles(id);}catch(IOException error){if(future==null)throw error;}
    }
    @Scheduled(fixedDelay=3600000) public void cleanup(){Instant cutoff=Instant.now().minus(retention,ChronoUnit.DAYS);for(Task task:new ArrayList<>(store.tasks.values()))if(!task.active()&&task.created.isBefore(cutoff))try{delete(task.id);}catch(IOException ignored){}}
    @PreDestroy void shutdown(){executor.shutdownNow();}
}
