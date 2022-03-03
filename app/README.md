# No Loss Lottery App

## Run app using:

```
yarn
yarn run dev
```

## Initialize app:

Setup the app by running the initialize test

1. Start the localnet validator
    ```
    anchor localnet
    ```
2. Run the Initialize test
    Modify the Anchor.toml
    ```
    [scripts]
    test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 -f 'Initialize' tests/**/*.ts"
    ```

    Run the test against the validator
    ```
    anchor test --skip-local-validator
    ```

    Get the Mint Public Key fron the log