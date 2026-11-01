# 4. Build: draw or build each case

dxn does not draw or build anything. It says what to build: the cases from
step 3, each with the combinations it covers. Draw them in a design tool,
build them in code, or give them to an agent.

## The brief

The cases are the brief, nothing more and nothing less:

```bash
dxn cases spec/button.dxn Button --json
```

```json
{
  "name": "Button",
  "subjects": ["Pointer", "enabled", "hover"],
  "combinations": 6,
  "cases": [
    {
      "values": { "enabled": "enabled", "hover": "rest" },
      "combinations": [
        { "dimensions": { "Pointer": "mouse" }, "parents": {}, "states": { "enabled": "enabled", "hover": "rest" } },
        { "dimensions": { "Pointer": "touch" }, "parents": {}, "states": { "enabled": "enabled", "hover": "rest" } }
      ]
    },
    …
  ]
}
```

Each case has the values that tell it apart, and every combination it
stands for.

## Asking an agent

Give the agent the model and the cases, and ask for one design per case,
named so it can be recorded in step 5. For example:

> Read `spec/button.dxn` and the cases from `dxn cases spec/button.dxn Button
> --json`. Draw one frame per case in `design/`, named after the case's
> values: `enabled`, `hovered`, `disabled`. Draw nothing that is not a case,
> and no case twice.

The model keeps the agent honest in both directions: it draws every case, so
nothing is forgotten, and only the cases, so it does not invent a disabled,
hovered button or a separate touch design that the model says looks the
same.

For this tutorial, three files stand in for the frames:

```
design/enabled.png
design/hovered.png
design/disabled.png
```

Next: [5. Record evidence](05-record-evidence.md), to say which frame shows
each case.
