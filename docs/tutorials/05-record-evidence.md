# 5. Record evidence: which frame shows each case

Evidence is a record that a case was drawn or built: who did it, when, where,
and what the file was like at that moment. Its shape is declared in the same
file, with **records**. Add them to `spec/button.dxn`:

```
# Who records evidence, and how.
enum Actor = designer
enum Tool = file

# Where a case is drawn: a file, and a frame in it.
record Source {
  file: RelativePath
  frame: NonEmptyString
}

# A case, drawn: who drew it, when, where, and the file as it was.
record Evidence with context {
  actor: Actor
  tool: Tool = when actor {
    designer -> file
  }
  at: Timestamp
  source: Source
  fingerprint: NonEmptyString
}
```

- `with context` makes each piece of evidence a fact about one combination of
  the model.
- `tool` follows from the actor: a designer's evidence is a whole file. A
  pen.dev file's evidence can be one frame in it, with `pen-dev` as the tool.
- `at`, `source` and `fingerprint` are filled in by `dxn attach`: the time,
  the file and frame, and the file's fingerprint now, so a later change shows.

## Attaching

The evidence lives in `spec/evidence/`, beside the model. `dxn attach`
records it for each combination you give; `a|b` lists several at once:

```bash
dxn attach spec/button.dxn Button --file design/enabled.png --frame enabled \
  --field actor=designer "Pointer=mouse|touch" enabled=enabled hover=rest
```

```
Attached 2 records to spec/evidence/button.json
```

```bash
dxn attach spec/button.dxn Button --file design/hovered.png --frame hovered \
  --field actor=designer Pointer=mouse enabled=enabled hover=hovered
```

```
Attached 1 record to spec/evidence/button.json
```

One frame shows the whole disabled case, all three of its combinations:

```bash
dxn attach spec/button.dxn Button --file design/disabled.png --frame disabled \
  --field actor=designer "Pointer=mouse|touch" enabled=disabled "hover=rest|hovered"
```

```
Attached 3 records to spec/evidence/button.json
```

A combination that cannot happen is refused, so evidence is only ever about
the model's real combinations. Each stored entry looks like this:

```json
{
  "context": {
    "path": "Button",
    "dimensions": { "Pointer": "mouse" },
    "parents": {},
    "states": { "enabled": "enabled", "hover": "rest" }
  },
  "actor": "designer",
  "at": "2026-11-01T10:00:00Z",
  "source": { "file": "design/enabled.png", "frame": "enabled" },
  "fingerprint": "d985a8d12a4fd31d19308144591a0213dc11e36a"
}
```

## Validating

```bash
dxn validate spec/button.dxn
```

```
spec/button.dxn: Evidence, 6 records in 1 file in evidence/
```

`dxn validate` checks every stored record against the model: its shape, its
values, and that the combination it is about exists. When the model changes,
it is what says which evidence no longer fits.

Next: [6. Track](06-track.md), to see what has evidence and what does not.
