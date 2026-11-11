---
title: White space only goldmark trims
---

A line of only a no-break space (next) is text, not a blank line, so the
picture after it is in this paragraph, not a figure.
 
![Not a figure](a.png){#fig:nbsp}

A dash rule ending in a zero-width no-break space is text too, not a heading
underline:
---﻿
![Not a figure either](b.png){#fig:bom}

![A figure](c.png){#fig:yes}
