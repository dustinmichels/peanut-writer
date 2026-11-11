# Captions

| a | b |
| - | - |
| 1 | 2 |

Table: A caption
over two lines {#tbl:multi}

| c |
| - |

Not a caption, so the label below stays text {#tbl:none}

# Picture grids

![One](a.png) ![Two](b.png)
![Three](c.png)
Figure: Captioned on its own line {#fig:grid columns=2}

![](a.png)
![](b.png)
Figure: A caption
over two lines {#fig:grid2 width=80% align=left}

![](a.png)![](b.png)Figure: Straight after the last picture {#fig:tight}

![](a.png) ![](b.png) Figure: after a space, this is a paragraph

![](a.png)
![](b.png) Figure: and so is this

![](a.png)
![](b.png)
figure: lower case {#fig:lower columns=9}

![](a.png)
![](b.png)
Figure: {#fig:bare columns=2x}

![](a.png)
Figure: one picture is a paragraph

![](a.png)
![](b.png)

Figure: a blank line apart is a paragraph too
