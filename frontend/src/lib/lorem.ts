// Sample content for trying out a template: headings, text, footnotes, math,
// figures and tables, from the command palette's "Lorem Ipsum".

// The sample pictures, drawn without text so they look the same everywhere.
export const loremPictures: { name: string; svg: string }[] = [
  {
    name: "lorem-chart.svg",
    svg: svg(
      640,
      400,
      [
        `<rect width="640" height="400" fill="#FBF6EF"/>`,
        `<path d="M60 40V350H610" fill="none" stroke="#8A7560" stroke-width="3"/>`,
        ...[150, 230, 190, 290, 250, 320].map((h, i) => {
          const x = 90 + i * 85;
          return `<rect x="${x}" y="${350 - h}" width="55" height="${h}" rx="4" fill="${i % 2 ? "#C9853F" : "#7A9E7E"}"/>`;
        }),
        `<polyline points="117,180 202,120 287,150 372,80 457,110 542,50" fill="none" stroke="#3E5C76" stroke-width="4" stroke-linejoin="round"/>`,
      ].join(""),
    ),
  },
  {
    name: "lorem-landscape.svg",
    svg: svg(
      640,
      360,
      [
        `<rect width="640" height="360" fill="#CFE3EE"/>`,
        `<circle cx="500" cy="90" r="45" fill="#F2C14E"/>`,
        `<path d="M0 260L140 120L260 230L380 100L520 240L640 160V360H0Z" fill="#6B8F71"/>`,
        `<path d="M0 300C160 250 320 330 640 270V360H0Z" fill="#4A6B52"/>`,
      ].join(""),
    ),
  },
  {
    name: "lorem-circles.svg",
    svg: svg(
      400,
      300,
      [
        `<rect width="400" height="300" fill="#F4E9DC"/>`,
        `<circle cx="140" cy="150" r="90" fill="#C9853F" fill-opacity="0.8"/>`,
        `<circle cx="260" cy="150" r="90" fill="#3E5C76" fill-opacity="0.7"/>`,
      ].join(""),
    ),
  },
  {
    name: "lorem-stripes.svg",
    svg: svg(
      400,
      300,
      [
        `<rect width="400" height="300" fill="#E8EFE6"/>`,
        ...[0, 1, 2, 3, 4].map(
          (i) =>
            `<rect x="${30 + i * 72}" y="40" width="40" height="220" rx="20" fill="${["#7A9E7E", "#C9853F", "#3E5C76", "#B5585A", "#F2C14E"][i]}"/>`,
        ),
      ].join(""),
    ),
  },
];

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
}

// loremMarkdown is the sample text, with srcs the stored loremPictures (in
// order) and suffix added to every label, so they don't clash with the
// document's own.
export function loremMarkdown(srcs: string[], suffix: string): string {
  const [chart, landscape, circles, stripes] = srcs;
  const l = (label: string) => label + suffix;
  return `# Introduction

Lorem ipsum dolor sit amet, consectetur adipiscing elit. **Sed do eiusmod** tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. As @${l("fig:lorem-chart")} shows, duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.[^${l("lorem-source")}] Curabitur pretium tincidunt lacus, _nulla gravida orci_ a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.

[^${l("lorem-source")}]: Cicero, _De finibus bonorum et malorum_, 45 BC. Nam libero tempore, cum soluta nobis est eligendi optio.

![Lorem ipsum dolor sit amet, by quarter.](${chart}){#${l("fig:lorem-chart")} width=70%}

## Background

Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam.

- Maecenas fermentum consequat mi.
- Donec fermentum, pellentesque malesuada nulla.
- Aliquam erat volutpat, nunc tincidunt.

### Prior work

Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. @${l("tbl:lorem-results")} summarizes vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante.

| Method      | Lorem | Ipsum | Dolor |
| :---------- | ----: | ----: | ----: |
| Consectetur |  12.4 |  0.81 |    37 |
| Adipiscing  |  15.9 |  0.77 |    42 |
| Elit        |  21.3 |  0.92 |    29 |
| Sed do      |   9.8 |  0.64 |    51 |

Table: Lorem ipsum results, per method {#${l("tbl:lorem-results")}}

# Methods

Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a. Vivamus magna justo, lacinia eget consectetur sed, convallis at tellus. Proin eget tortor risus, as in @${l("fig:lorem-landscape")}.

![Vivamus suscipit tortor eget felis porttitor volutpat.](${landscape}){#${l("fig:lorem-landscape")} width=60%}

1. Nulla porttitor accumsan tincidunt.
2. Cras ultricies ligula sed magna dictum porta.[^${l("lorem-method")}]
3. Quisque velit nisi, pretium ut lacinia in, elementum id enim.

[^${l("lorem-method")}]: Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet.

Donec velit neque, auctor sit amet aliquam vel, with $\\alpha \\in [0, 1]$ and $n$ samples $x_1, \\dots, x_n$. Ullamcorper sit amet ligula per @${l("eq:lorem-mean")}:

$$
\\bar{x}_\\alpha = \\frac{1}{n} \\sum_{i=1}^{n} x_i^{\\alpha}, \\qquad \\sigma^2 = \\int_{-\\infty}^{\\infty} (x - \\mu)^2 \\, f(x) \\, dx
$$ {#${l("eq:lorem-mean")}}

## Materials

Sed porttitor lectus nibh. Curabitur arcu erat, accumsan id imperdiet et, porttitor at sem. @${l("fig:lorem-grid")} pairs two vivamus suscipit, and @${l("tbl:lorem-materials")} lists the rest.

![Circles](${circles})
![Stripes](${stripes})
Figure: Donec rutrum congue leo eget malesuada {#${l("fig:lorem-grid")} columns=2}

| Material   | Quantity | Notes                    |
| :--------- | :------: | :----------------------- |
| Praesent   |    3     | Sapien massa convallis   |
| Vestibulum |    12    | Ante ipsum primis        |
| Cras       |    7     | Ultricies ligula sed     |

Table: Lorem ipsum materials {#${l("tbl:lorem-materials")}}

# Conclusion

Nulla quis lorem ut libero malesuada feugiat. Donec sollicitudin molestie malesuada. Quisque velit nisi, pretium ut lacinia in, elementum id enim.

> Curabitur non nulla sit amet nisl tempus convallis quis ac lectus.

Vestibulum ac diam sit amet quam vehicula elementum sed sit amet dui. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;
}

// loremLabels are the labels loremMarkdown gives, before their suffix.
export const loremLabels = [
  "fig:lorem-chart",
  "fig:lorem-landscape",
  "fig:lorem-grid",
  "tbl:lorem-results",
  "tbl:lorem-materials",
  "eq:lorem-mean",
  "lorem-source",
  "lorem-method",
];
