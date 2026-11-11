---
title: Numbering basics
---

# Figures

![A peanut](a.png){#fig:peanut width=60% align=right}

![Width in pixels counts for nothing](b.png){#fig:px width=50px}

![A quoted width](c.png) {#fig:quoted width="40 %" align="left"}

![Attributes on the next line](d.png)
{#fig:next width=30}

![Not a figure](e.png) because of this text.

Text first, then ![an image](f.png) inline.

# Tables

| Year | Sales |
| ---- | ----: |
| 2024 |    10 |

Table: Sales by year {#tbl:sales}

| Header with fewer cells |
| --- | --- |
| 1 | 2 |

| One | Two | Three |
| --- | --- |

Text right before a table
| a | b |
| - | - |

: A colon caption {#tbl:colon}

# Equations

$$
E = mc^2
$$ {#eq:energy}

$$ a^2 + b^2 = c^2 $$ {#eq:pythagoras}

$$ x + y $$

$$ \frac{1}{2}} $$ {#eq:broken}

$$ e^{i\pi} = -1 $$ {#notlabelled}

See @fig:peanut, @tbl:sales and @eq:energy.
