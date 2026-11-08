# 业务 API

Base URL由App设置。统一前缀 `/api`，所有请求带 `Authorization: Bearer <AIVOICE_API_TOKEN>`。业务JSON响应格式：

```json
{"code":"OK","message":"成功","data":{}}
```

错误使用适当HTTP状态，`code`为机器可读错误码，`message`为中文原因。音频下载成功时直接返回二进制，失败仍返回JSON错误；不把错误JSON保存成音频。

| 方法与路径 | 参数 | 结果 |
|---|---|---|
| GET `/api/health` | 无 | 版本和AI就绪状态；业务可用不等于模型已就绪 |
| GET `/api/voices` | 无 | 分类占位及真实自定义音色；占位 `available=false` |
| POST `/api/voices` | multipart `reference`、`name`、`category`、`authorized=true` | 校验参考音频并返回含 `id` 的音色 |
| GET `/api/voices/{id}/audio` | UUID | 授权参考录音，WAV，用于真实试听 |
| DELETE `/api/voices/{id}` | UUID | 删除音色及参考文件；任务创建时已复制参考音频 |
| POST `/api/convert` | multipart `audio`、`voiceId`、可选 `format=m4a/wav` | HTTP 202，任务对象，含 `id`、`status` |
| GET `/api/tasks/{id}` | UUID | 状态、音色、格式、创建时间、原声时长、失败原因 |
| GET `/api/tasks/{id}/audio` | UUID | 成功后M4A或WAV；未成功409，缺失410 |
| DELETE `/api/tasks/{id}` | UUID | 删除任务及文件；活动任务取消等待，丢弃其结果 |

响应保留通用 `id`，并同时提供规范字段 `taskId` / `voiceId`。状态机：`QUEUED → RUNNING → SUCCEEDED / FAILED`。取消通过DELETE移除任务，因此随后查询返回404。App另外显示本地的上传、下载、取消状态，不虚构推理百分比。

常见错误：`UNAUTHORIZED` 401、`TOKEN_NOT_CONFIGURED` 503、`INVALID_ID/INVALID_ARGUMENT` 400、`VOICE_NOT_FOUND/TASK_NOT_FOUND` 404、`FILE_TOO_LARGE` 413、`INVALID_AUDIO` 422、`QUEUE_FULL/AI_BUSY` 429、`MODEL_NOT_READY` 503、`AI_UNAVAILABLE` 502、`TASK_NOT_READY` 409。

上传限制20MB，请求整体22MB。原声0.5–60秒，参考录音3–25秒。服务用FFmpeg验证真实容器并规范化为单声道22050Hz PCM WAV；禁止把播放列表当音频读入。M4A只在模型输出后编码一次AAC；WAV输出为PCM16。

## 内部 AI API

只监听 `127.0.0.1:8090`，不公开端口。独立Token `AIVOICE_AI_TOKEN`，同样放在Bearer头。

- GET `/internal/health`：`ready/loading/error/device/engine/commit`。
- POST `/internal/normalize`：multipart `audio` 和 `kind=source/reference`，返回WAV及 `X-Audio-Duration`。
- POST `/internal/convert`：multipart `audio/reference/format`，返回真实推理后音频。模型未就绪503，并发忙429。

内部接口不对外提供参考路径参数，避免客户端指定服务器任意文件。所有音频在请求专有临时目录中处理，完成后清理。生产只运行一个AI worker以避免重复模型加载。

## 持久化与重试

Java使用每条记录一个JSON文件、原子替换和目录锁。重启会恢复音色与任务，未完成任务标记失败并保留原声。用户主动重试会创建新任务，避免在网络超时时悄悄重复耗费GPU资源。App重启后可重新轮询已有taskId；上传中断但未取得taskId时保留原声并提示重试。

业务任务默认保留30天，可通过 `AIVOICE_RETENTION_DAYS` 修改，每小时清理过期且非活动任务。参考音色保留至手动删除。iPhone已下载历史不随服务端保留期删除。删除服务器任务时，正在Python中运行的一次模型调用可能继续到结束，结果会被丢弃，Python临时文件随后清理；不会谎称立即终止GPU运算。
