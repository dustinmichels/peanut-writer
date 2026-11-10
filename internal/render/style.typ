// Helpers for templates. A document's custom template (Design → Customize)
// changes some of its base template's fonts and colors; the changes are in
// style.json (see templates.Style). Each helper gives the changed value, or
// the template's own when it isn't changed.

#let style = json("style.json")

// The chosen font first, the template's after it as fallbacks.
#let custom-font(key, fonts) = if key in style {
  (style.at(key),) + if type(fonts) == array { fonts } else { (fonts,) }
} else { fonts }

#let custom-color(key, color) = if key in style { rgb("#" + style.at(key)) } else { color }

#let custom-size(key, size) = if key in style { style.at(key) * 1pt } else { size }
