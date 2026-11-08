function stop(message){console.error('构建暂未执行：'+message);process.exit(1);}
if (process.env.EAS_BUILD_PLATFORM && process.env.EAS_BUILD_PLATFORM !== "ios")
  process.exit(0);
if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(process.env.EXPO_PROJECT_ID||''))stop('请提供已有Expo项目的准确EXPO_PROJECT_ID；不会创建替代项目。');
if(!/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/.test(process.env.AIVOICE_IOS_BUNDLE_IDENTIFIER||''))stop('请明确填写合法且属于本项目的iOS Bundle Identifier。');
if(process.env.AIVOICE_ALLOW_LOCAL_HTTP==='1')stop('独立分发构建必须使用HTTPS。');
console.log(
  "iOS构建标识与HTTPS配置检查通过。苹果会员、设备登记和签名由EAS验证。",
);
