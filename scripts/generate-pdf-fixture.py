"""可选：使用 reportlab 重新生成匿名合成 PDF。运行应用与 npm test 不依赖 Python。"""
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from pathlib import Path
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
path=Path('src/imports/__fixtures__/synthetic-timetable.pdf')
c=canvas.Canvas(str(path),pagesize=(1100,1100),pageCompression=1)
c.setTitle('Synthetic anonymous timetable for automated tests')
c.setAuthor('MyTimetable synthetic fixture')
def text(s,x,y,size=10):
 c.setFont('STSong-Light',size);c.drawString(x,1100-y-10,s)
c.setStrokeColorRGB(.7,.7,.7)
for y in [80,260,440,620,800,980]:c.line(115,1100-y,955,1100-y)
for x in range(115,956,120):c.line(x,120,x,1020)
text('2026-2027学年 第一学期',300,15,14)
for i,d in enumerate('一二三四五六日'):text('星期'+d,160+i*120,50)
for i,n in enumerate([1,3,5,7,9]):text(f'{n}-{n+1}节',35,160+i*180)
def block(s,x,y):
 for i,line in enumerate(s.split('\n')):text(line,x,y+i*13)
block('课程名称：合成数学\n教师：匿名甲\n周次：3-5周(单),6-18周\n教室：合成楼101',130,104)
block('课程名称：合成英语\n教师：匿名乙\n周次：6-18周(双)\n教室：合成楼102',130,174)
block('课程名称：合成数学\n教师：匿名甲\n周次：14-16周\n教室：合成楼201',370,300)
block('课程名称：劳动实践\n教师：匿名丙\n周次：1-2周,7-12周\n教室：实践基地',140,996)
c.save()
print(path)
