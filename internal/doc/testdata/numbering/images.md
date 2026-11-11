# Ways to write a picture

![Spaces in the name](<images/my picture.png>){#fig:spaces}

![Parentheses in the name](images/shot(1).png){#fig:parens}

![With a title](a.png "A title") ![Not alone](b.png)

![A title in single quotes](a.png 'A title'){width=40%}

![A caption with [brackets] in it](a.png){#fig:brackets}

![Escaped \] bracket](images/a\_b.png)

![No picture yet]()

![After a line break](a.png)\
{#fig:break}

![](a.png)\
![](<b c.png>)\
Figure: A grid with line breaks {#fig:grid}

Width that isn't a number: ![](a.png)

![Not a width](a.png){width=nan}

![A bracket in math $x]$ closes nothing](a.png){#fig:math}

![A bracket in code `a]b` closes nothing](a.png){#fig:code}

![Escaped math \$x]$ is text](a.png)

![a `]` b](a.png)
![c $[0,1)$ d](b.png)
Figure: Brackets in the pictures' alt text {#fig:literal-grid}

![A bracket in a double-backtick span ``a`]b``](a.png){#fig:code2}
