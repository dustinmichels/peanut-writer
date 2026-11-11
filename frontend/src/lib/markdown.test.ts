import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scan } from "./markdown";

// scan must number figures, tables and equations as internal/doc does: each
// sample's .want is what doc.Parse numbers (internal/doc/numbering_test.go).
const dir = join(import.meta.dir, "../../../internal/doc/testdata/numbering");

for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  test(name, () => {
    const got = scan(readFileSync(join(dir, name), "utf8")).map((x) => {
      const f = [x.kind, String(x.number)];
      if (x.label) f.push(x.label);
      if (x.kind === "figure") {
        const pictures = x.pictures ?? [];
        if (pictures.length > 1) f.push(`pictures=${pictures.length} columns=${x.columns}`);
        if (x.width) f.push(`width=${x.width}`);
        if (x.position) f.push(`align=${x.position}`);
      }
      return f.join(" ") + "\n";
    });
    expect(got.join("")).toBe(readFileSync(join(dir, name.replace(/\.md$/, ".want")), "utf8"));
  });
}
