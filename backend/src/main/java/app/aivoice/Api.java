package app.aivoice;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

public final class Api {
    public record Result<T>(String code,String message,T data) {}
    public static <T> Result<T> ok(T data){return new Result<>("OK","成功",data);}
    public static class Fault extends RuntimeException {
        final int status;final String code;
        public Fault(int status,String code,String message){super(message);this.status=status;this.code=code;}
    }
    @Component public static class Auth extends OncePerRequestFilter {
        private final String token;private final ObjectMapper json;
        public Auth(@Value("${aivoice.api-token}") String token,ObjectMapper json){this.token=token;this.json=json;}
        @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws IOException,ServletException {
            if(!req.getRequestURI().startsWith("/api/")){chain.doFilter(req,res);return;}
            String authorization=req.getHeader("Authorization");
            if(token.isBlank()||authorization==null||!MessageDigest.isEqual(("Bearer "+token).getBytes(StandardCharsets.UTF_8),authorization.getBytes(StandardCharsets.UTF_8))){
                res.setStatus(token.isBlank()?503:401);res.setContentType("application/json;charset=UTF-8");
                json.writeValue(res.getOutputStream(),new Result<>(token.isBlank()?"TOKEN_NOT_CONFIGURED":"UNAUTHORIZED",token.isBlank()?"服务端尚未配置API Token。":"API Token不正确。",null));return;
            }
            res.setHeader("Cache-Control","private, no-store");chain.doFilter(req,res);
        }
    }
    @RestControllerAdvice public static class Errors {
        @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class) public ResponseEntity<Result<Void>> notFound(Exception e){return fault(new Fault(404,"NOT_FOUND","接口不存在。"));}
        @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class) public ResponseEntity<Result<Void>> method(Exception e){return fault(new Fault(405,"METHOD_NOT_ALLOWED","请求方法不正确。"));}
        @ExceptionHandler(Fault.class) public ResponseEntity<Result<Void>> fault(Fault e){return ResponseEntity.status(e.status).body(new Result<>(e.code,e.getMessage(),null));}
        @ExceptionHandler(MaxUploadSizeExceededException.class) public ResponseEntity<Result<Void>> size(Exception e){return fault(new Fault(413,"FILE_TOO_LARGE","上传音频不能超过20MB。"));}
        @ExceptionHandler({MethodArgumentNotValidException.class,ConstraintViolationException.class,IllegalArgumentException.class,org.springframework.web.bind.MissingServletRequestParameterException.class,org.springframework.web.multipart.support.MissingServletRequestPartException.class})
        public ResponseEntity<Result<Void>> validation(Exception e){return fault(new Fault(400,"INVALID_ARGUMENT","参数不完整或格式不正确，请检查音色、名称和输出格式。"));}
        @ExceptionHandler(IOException.class) public ResponseEntity<Result<Void>> io(IOException e){return fault(new Fault(500,"STORAGE_ERROR","文件存储失败，请检查服务器空间和目录权限。"));}
        @ExceptionHandler(Exception.class) public ResponseEntity<Result<Void>> unexpected(Exception e){
            org.slf4j.LoggerFactory.getLogger(Errors.class).error("Request failed: {}",e.getClass().getSimpleName());
            return fault(new Fault(500,"INTERNAL_ERROR","服务处理失败，请查看服务端日志。"));
        }
    }
}
