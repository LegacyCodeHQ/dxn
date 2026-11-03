# 6. Track: what has evidence, and what is missing or stale

```bash
dxn status spec/button.dxn
```

After the first two attaches of step 5, before the disabled one:

```
spec/button.dxn: Evidence 3 of 6 combinations recorded

| path   | combinations | recorded | stale | gone | missing |
| ------ | ------------ | -------- | ----- | ---- | ------- |
| Button | 6            | 3        | 0     | 0    | 3       |
```

With `--missing`, it says which:

```
Missing:
  Button on Pointer mouse: enabled = disabled, hover = rest
  Button on Pointer mouse: enabled = disabled, hover = hovered
  Button on Pointer touch: enabled = disabled, hover = rest
```

They are the disabled case's three combinations, written the way a context
would say them. After the third attach, everything has evidence:

```
spec/button.dxn: Evidence 6 of 6 combinations recorded
```

## Stale evidence

Each stored record keeps its node's fingerprint from when it was recorded. Change a
node, and its evidence is **stale**: it shows a design that no longer
exists. Redraw the hovered button, and ask again:

```
spec/button.dxn: Evidence 5 of 6 combinations recorded, 1 stale

| path   | combinations | recorded | stale | gone | missing |
| ------ | ------------ | -------- | ----- | ---- | ------- |
| Button | 6            | 5        | 1     | 0    | 0       |
```

```
Stale:
  Button on Pointer mouse: enabled = enabled, hover = hovered
```

Recording the node again replaces the stored record, with the fingerprint it has now:

```bash
dxn attach spec/button.dxn Button --actor Designer \
  --data '{"at": "2026-11-01T10:30:00Z", "source": {"file": "design/button.pen", "frame": "states", "node": "hovered"}}' \
  Pointer=mouse enabled=enabled hover=hovered
```

```
Attached 1 stored record to spec/evidence/button.json, replacing 1
```

```
spec/button.dxn: Evidence 6 of 6 combinations recorded
```

A stored record whose file, frame or node is deleted is **gone**. So `dxn status` answers, at any
moment: is every case drawn, and does every drawing still match?

Next: [7. Test](07-test.md), to write down rules the model must always follow.
