# Formatting (`internal/mdfmt`)

- Equation attribute blocks are taken off before oxfmt runs (its math ends only at a bare `$$`) and put back after;
  an equation inside a code fence that's itself in a list or quote is mistaken for one, which can misplace labels.
