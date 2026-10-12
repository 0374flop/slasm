#!/bin/bash
# Прогон тестов c2slasm: C -> slasm -> TS-интерпретатор, сравнение с "// expect: N".
# Если N в 0..255, результат дополнительно сверяется с gcc (код возврата main).
# Использование: ./test.sh [имя_кейса ...]

cd "$(dirname "$0")" || exit 1
ROOT="$(cd ../.. && pwd)"
RUN="node $ROOT/lib/cli/sl-main.js run"

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
    out="/tmp/c2slasm_$name.slasm"

    if ! ./c2slasm "$f" -o "$out" >/dev/null 2>/tmp/c2slasm_err; then
        echo "FAIL $name: compile error: $(cat /tmp/c2slasm_err)"
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
        if gcc -w -o "/tmp/c2slasm_gcc_$name" "$f" 2>/dev/null; then
            "/tmp/c2slasm_gcc_$name"; gcc_code=$?
            [ "$gcc_code" != "$expect" ] && echo "WARN $name: gcc gives $gcc_code, expect says $expect"
        fi
    fi
done

echo "--- passed $pass, failed $fail"
[ "$fail" -eq 0 ]
