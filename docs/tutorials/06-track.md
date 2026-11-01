# 6. Track: what has evidence, and what is missing or stale

```bash
dxn status spec/button.dxn
```

After the first two attaches of step 5, before the disabled one:

```
spec/button.dxn: Evidence for 3 of 6 combinations

| path   | combinations | present | stale | gone | missing |
| ------ | ------------ | ------- | ----- | ---- | ------- |
| Button | 6            | 3       | 0     | 0    | 3       |
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
spec/button.dxn: Evidence for 6 of 6 combinations
```

## Stale evidence

Each entry keeps the file's fingerprint from when it was recorded. Change a
file, and its evidence is **stale**: it shows a design that no longer
exists. Redraw the hovered button, and ask again:

```
spec/button.dxn: Evidence for 5 of 6 combinations; 1 stale

| path   | combinations | present | stale | gone | missing |
| ------ | ------------ | ------- | ----- | ---- | ------- |
| Button | 6            | 5       | 1     | 0    | 0       |
```

```
Stale:
  Button on Pointer mouse: enabled = enabled, hover = hovered
```

Recording the frame again replaces the entry, with the fingerprint it has now:

```bash
dxn attach spec/button.dxn Button --file design/hovered.png --frame hovered \
  --field actor=designer Pointer=mouse enabled=enabled hover=hovered
```

```
Attached 1 record to spec/evidence/button.json, replacing 1
```

```
spec/button.dxn: Evidence for 6 of 6 combinations
```

An entry whose file is deleted is **gone**. So `dxn status` answers, at any
moment: is every case drawn, and does every drawing still match?

Next: [7. Test](07-test.md), to write down rules the model must always follow.
