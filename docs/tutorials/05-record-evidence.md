# 5. Record evidence: which frame shows each case

Evidence is a record that a case was drawn or built: who did it, when, where,
and what the file was like at that moment. Its shape is declared in the same
file, with **records**. Add them to `spec/button.dxn`:

```
# A case, drawn: when, and the node of the design that shows it.
actor Designer records Evidence
record Evidence {
  at: Timestamp
  source: PenNode
}
```

- `actor Designer records Evidence` says who records it, and makes each piece
  of evidence a fact about one combination of the model.
- `PenNode` is built in: a node of a pen.dev design file, by its file, its
  frame and the node in it, and the node's fingerprint when it was recorded,
  so a later change shows. `dxn attach` computes the fingerprint.

## Attaching

The evidence lives in `spec/evidence/`, beside the model. `dxn attach`
records it for each combination you give; `a|b` lists several at once:

```bash
dxn attach spec/button.dxn Button --actor Designer \
  --data '{"at": "2026-11-01T10:00:00Z", "source": {"file": "design/button.pen", "frame": "states", "node": "enabled"}}' \
  "Pointer=mouse|touch" enabled=enabled hover=rest
```

```
Attached 2 stored records to spec/evidence/button.json
```

```bash
dxn attach spec/button.dxn Button --actor Designer \
  --data '{"at": "2026-11-01T10:00:00Z", "source": {"file": "design/button.pen", "frame": "states", "node": "hovered"}}' \
  Pointer=mouse enabled=enabled hover=hovered
```

```
Attached 1 stored record to spec/evidence/button.json
```

One node shows the whole disabled case, all three of its combinations:

```bash
dxn attach spec/button.dxn Button --actor Designer \
  --data '{"at": "2026-11-01T10:00:00Z", "source": {"file": "design/button.pen", "frame": "states", "node": "disabled"}}' \
  "Pointer=mouse|touch" enabled=disabled "hover=rest|hovered"
```

```
Attached 3 stored records to spec/evidence/button.json
```

A combination that cannot happen is refused, so evidence is only ever about
the model's real combinations. Each stored record looks like this:

```json
{
  "context": {
    "path": "Button",
    "dimensions": { "Pointer": "mouse" },
    "parents": {},
    "states": { "enabled": "enabled", "hover": "rest" }
  },
  "actor": "Designer",
  "at": "2026-11-01T10:00:00Z",
  "source": {
    "file": "design/button.pen",
    "frame": "states",
    "node": "enabled",
    "fingerprint": "d985a8d12a4fd31d19308144591a0213dc11e36a"
  }
}
```

## Validating

```bash
dxn validate spec/button.dxn
```

```
spec/button.dxn: Evidence, 6 stored records in 1 file in evidence/
```

`dxn validate` checks every stored record against the model: its shape, its
values, and that the combination it is about exists. When the model changes,
it is what says which evidence no longer fits.

Next: [6. Track](06-track.md), to see what has evidence and what does not.
