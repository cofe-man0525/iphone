from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent.parent
image=Image.new('RGB',(1024,1024),'#F3EEF9');draw=ImageDraw.Draw(image)
draw.rounded_rectangle((170,170,854,854),radius=210,fill='#6750A4')
for x,h in [(332,110),(420,230),(512,360),(604,230),(692,110)]:draw.rounded_rectangle((x-20,512-h//2,x+20,512+h//2),radius=20,fill='#FFFFFF')
image.save(root/'mobile'/'assets'/'icon.png')
image.resize((64,64),Image.Resampling.LANCZOS).save(root/'mobile'/'assets'/'favicon.png')
