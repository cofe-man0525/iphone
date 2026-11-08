package app.aivoice;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import static app.aivoice.Models.*;

@Repository public class Storage implements AutoCloseable {
    final Path root;final Map<String,Voice> voices=new ConcurrentHashMap<>();final Map<String,Task> tasks=new ConcurrentHashMap<>();
    private final ObjectMapper json;private final FileChannel lockChannel;private final FileLock fileLock;
    public Storage(@Value("${aivoice.data-dir}") String directory,ObjectMapper json)throws IOException{
        this.json=json;root=Path.of(directory).toAbsolutePath().normalize();Files.createDirectories(root);
        for(String child:List.of("voices","tasks","tmp"))Files.createDirectories(root.resolve(child));
        lockChannel=FileChannel.open(root.resolve("instance.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);fileLock=lockChannel.tryLock();
        if(fileLock==null)throw new IOException("Data directory is already in use by another backend.");
        try(var files=Files.list(root.resolve("voices"))){for(Path path:files.filter(p->p.toString().endsWith(".json")).toList()){Voice voice=json.readValue(path.toFile(),Voice.class);uuid(voice.id());voices.put(voice.id(),voice);}}
        try(var files=Files.list(root.resolve("tasks"))){for(Path folder:files.filter(Files::isDirectory).toList()){
            if(!Files.isRegularFile(folder.resolve("task.json")))continue;
            Task task=json.readValue(folder.resolve("task.json").toFile(),Task.class);uuid(task.id);tasks.put(task.id,task);
            if(task.active()){task.status="FAILED";task.error="服务器重启中断了处理，原声已保留，请重新转换。";save(task);}
        }}
    }
    public static String uuid(String id){if(id==null||!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))throw new Api.Fault(400,"INVALID_ID","记录编号格式不正确。");return id;}
    Path voiceFile(String id){return root.resolve("voices").resolve(uuid(id)+".wav");}
    Path taskFolder(String id){return root.resolve("tasks").resolve(uuid(id));}
    public Voice voice(String id){Voice v=voices.get(uuid(id));if(v==null||!Files.isRegularFile(voiceFile(id)))throw new Api.Fault(404,"VOICE_NOT_FOUND","音色不存在或参考文件已丢失。");return v;}
    public Task task(String id){Task t=tasks.get(uuid(id));if(t==null)throw new Api.Fault(404,"TASK_NOT_FOUND","任务不存在或已清理。");return t;}
    private void atomic(Path path,Object value)throws IOException{
        Path next=path.resolveSibling(path.getFileName()+".next");byte[] bytes=json.writeValueAsBytes(value);
        try(FileChannel channel=FileChannel.open(next,StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING,StandardOpenOption.WRITE)){channel.write(java.nio.ByteBuffer.wrap(bytes));channel.force(true);}
        try{Files.move(next,path,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}catch(AtomicMoveNotSupportedException e){Files.move(next,path,StandardCopyOption.REPLACE_EXISTING);}
    }
    synchronized void add(Voice voice,byte[] audio)throws IOException{Files.write(voiceFile(voice.id()),audio,StandardOpenOption.CREATE_NEW);try{atomic(root.resolve("voices").resolve(voice.id()+".json"),voice);voices.put(voice.id(),voice);}catch(IOException e){Files.deleteIfExists(voiceFile(voice.id()));throw e;}}
    synchronized void add(Task task)throws IOException{tasks.put(task.id,task);save(task);}
    synchronized void save(Task task)throws IOException{if(tasks.containsKey(task.id))atomic(taskFolder(task.id).resolve("task.json"),task);}
    synchronized void deleteVoice(String id)throws IOException{voice(id);voices.remove(id);Files.deleteIfExists(root.resolve("voices").resolve(uuid(id)+".json"));Files.deleteIfExists(voiceFile(id));}
    synchronized void forgetTask(String id){tasks.remove(uuid(id));}
    void deleteTaskFiles(String id)throws IOException{
        Path folder=taskFolder(id);
        if(!folder.getParent().equals(root.resolve("tasks"))||Files.isSymbolicLink(folder))throw new IOException("Unsafe task directory");
        if(Files.exists(folder))try(var files=Files.walk(folder)){for(Path p:files.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(p);}
    }
    @PreDestroy public void close()throws IOException{if(fileLock.isValid())fileLock.release();lockChannel.close();}
}
