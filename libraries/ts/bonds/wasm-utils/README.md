# Usage

Install `wasm-pack` from [here](https://rustwasm.github.io/wasm-pack/installer/).

Add

```
    "wasm-utils": "file:libraries/ts/wasm-utils/pkg"
```

to the `package.json`

From the package root, run:

```
wasm-pack build --target bundler libraries/ts/bonds/wasm-utils
```

And finally,

```
npm i libraries/ts/wasm-utils/pkg
```
