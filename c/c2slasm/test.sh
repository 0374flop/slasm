#!/bin/bash
cd "$(dirname "$0")" || exit 1
ROOT="$(cd ../.. && pwd)"
RUN="node $ROOT/lib/cli/sl-main.js run"
mkdir -p ./tests/cases-compiled

./build.sh || exit 1

if [ $# -gt 0 ]; then
    files=(); for n in "$@"; do files+=("tests/cases/$n.c"); done
else
    files=(tests/cases/*.c)
fi

pass=0; fail=0
for f in "${files[@]}"; do
    name=$(basename "$f" .c)
    expect=$(sed -n 's|^// expect: *||p' "$f" | head -1)
    out="./tests/cases-compiled/$name.slasm"

    if ! ./c2slasm "$f" -o "$out" >/dev/null 2>./tests/cases-compiled/c2slasm_err; then
        echo "FAIL $name: compile error: $(cat ./tests/cases-compiled/c2slasm_err)"
        fail=$((fail+1)); continue
    fi

    got=$($RUN "$out" 2>&1)
    if [ "$got" == "$expect" ]; then
        echo "ok   $name ($got)"
        pass=$((pass+1))
    else
        echo "FAIL $name: expected '$expect', got '$got'  ($out)"
        fail=$((fail+1))
    fi

    # перекрёстная проверка ожидания через gcc
    if [[ "$expect" =~ ^[0-9]+$ ]] && [ "$expect" -le 255 ]; then
        if gcc -w -o "./tests/cases-compiled/$name.gcc" "$f" 2>/dev/null; then
            "./tests/cases-compiled/$name.gcc"; gcc_code=$?
            [ "$gcc_code" != "$expect" ] && echo "WARN $name: gcc gives $gcc_code, expect says $expect"
        fi
    fi
done

echo "--- passed $pass, failed $fail"
[ "$fail" -eq 0 ]
