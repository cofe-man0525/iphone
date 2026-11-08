package app.aivoice;

import java.time.Instant;
import java.util.List;

public final class Models {
    public static final List<String> CATEGORIES=List.of("甜美女声","少女音","温柔女声","御姐音","磁性男声","少年音","中性音","自定义音色");
    public record Voice(String id,String name,String category,String description,boolean available,boolean custom,String previewUrl,Instant created){
        @com.fasterxml.jackson.annotation.JsonProperty(value="voiceId",access=com.fasterxml.jackson.annotation.JsonProperty.Access.READ_ONLY)
        public String voiceId(){return id;}
    }
    public static class Task {
        public String id,voiceId,voiceName,format;
        public volatile String status,error;
        public Instant created;
        public double duration;
        public Task(){}
        @com.fasterxml.jackson.annotation.JsonProperty(value="taskId",access=com.fasterxml.jackson.annotation.JsonProperty.Access.READ_ONLY)
        public String taskId(){return id;}
        public Task(String id,Voice voice,String format,double duration){this.id=id;this.voiceId=voice.id();this.voiceName=voice.name();this.format=format;this.duration=duration;this.status="QUEUED";this.created=Instant.now();}
        public boolean active(){return List.of("QUEUED","RUNNING").contains(status);}
    }
}
