# Code

````markdown
![Inside a four-backtick fence](a.png)
```
![Still inside: three backticks don't close it](b.png)
````

![After the fence](c.png){#fig:after}

~~~
| a |
| - |
~~~

    ![Indented code](d.png)

    | e |
    | - |

Text
    ![a lazy line, not code](e.png)

```
$$ x $$ {#eq:fenced}
```

<div>
![In an HTML block](f.png)
</div>

<!--
![In a comment](g.png)
-->

$$ y $$ {#eq:oneline}
![The line after a one-line equation](h.png)

[link]: https://example.com
![After a link definition](i.png){#fig:link}

Underlined
---

| t |
| - |
===
![The underline starts this paragraph](j.png)
