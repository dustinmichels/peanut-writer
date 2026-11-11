# Lists and quotes

- ![In a list](a.png){#fig:list}
- ![The next item](b.png)

1. Some text.

   ![After a blank line](c.png){#fig:ordered width=50}

   | a | b |
   | - | - |
   | 1 | 2 |

   Table: In an ordered list {#tbl:ordered}

   - Nested:

     $$ x^2 $$ {#eq:nested}

> ![In a quote](d.png){#fig:quote}
>
> | q |
> | - |
>
> Table: Quoted {#tbl:quote}

> ![Lazy text carries on the paragraph](e.png)
so this isn't a figure.

> > ![Two quotes deep](f.png)

- > ![A quote in a list](g.png)
  >
  > ![a](a.png)
  > ![b](b.png)
  > Figure: A grid in a quote in a list {#fig:deep}

-
  ![An item starting empty](h.png)

- a

  -

    ![An empty item and a blank line end the lists: this is code](i.png)

* item

      ![Indented code in an item](j.png)

A paragraph
2. ![A list starting at 2 doesn't interrupt a paragraph: this is text](k.png)

See @fig:list, @tbl:ordered, @eq:nested and @fig:deep.
