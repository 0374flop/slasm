# SLASM
`https://github.com/0374flop/slasm` - ссылка на github репо.
## install
Установка - `npm i slasm-0374 -g`, ну или `npm i slasm-0374`.

## help
Пишешь - `slasm help`, выведет примерно такое:
```
slasm

usage:
  slasm <file>
  slasm <command> [...args]

commands:
  run <file>
  eval <code>
  repl
  parse <code>
  pack <file> [z] [--key[=]<key>]
  unpack <file> [--key[=]<key>]
  encrypt <file.slasmbin|.slasmz> [--key[=]<key>]  (overwrites in-place)
  decrypt <file.slasmbin|.slasmz> [--key[=]<key>]  (overwrites in-place)
  decompile <file> [--out] [--key[=]<key>]
  (if --key is omitted where needed, reads from stdin)
  help
```

## Примеры кода
```
(W 1 (?* 1 100))
(clearstack)
(clog (JOIN Угадай число от 1 до 100!))
;-main-;
(clearstack)
(clog (JOIN Введи своё число:))
(clearstack)
(W 2 (q))
(clearstack)
(? (= (R 1) (R 2)) (gln win))
(? (< (R 2) (R 1)) (gln min))
(? (> (R 2) (R 1)) (gln more))
;-win-;
(clearstack)
(clog (JOIN Поздравляю! Ты угадал!))
(clearstack)
(clog (JOIN Это было число:))
(clearstack)
(clog (R 1))
(clearstack)
(jump (gln end))
;-min-;
(clearstack)
(clog (JOIN Слишком маленькое! Попробуй больше.))
(clearstack)
(jump (gln main))
;-more-;
(clearstack)
(clog (JOIN Слишком большое! Попробуй меньше.))
(clearstack)
(jump (gln main))
;-end-;
(clearstack)
(clog (JOIN Игра окончена!))
(clearstack)
```

Или другой вариант:
```
(W 1 (?* 1 100))
(clog "Guess a number from 1 to 100!")
;-main-;
(clog "Enter your guess:")
(W 2 (q))
(? (= (R 1) (R 2)) (gln win))
(? (< (R 2) (R 1)) (gln low))
(? (> (R 2) (R 1)) (gln high))
;-win-;
(clog "You got it!")
(clog (R 1))
(jump (gln end))
;-low-;
(clog "Too low! Try higher.")
(jump (gln main))
;-high-;
(clog "Too high! Try lower.")
(jump (gln main))
;-end-;
(clog "Game over!")
```

Или вообще импорт файлов:

greeting.slasm
```
(jump (gln main))
;=greet:1:0=;
(clog (~ "Hello from module, " (~ (R 1) "!")))
(ret)
;-main-;
(clog 1234)
(call (gln greet))
```

main.slasm
```
;+./greeting:greet+;
(W greet.1 "World")
(callns "greet" "greet")
(clog "done!")
(W 1 "World2")
(clog (R 1))
```

Если нужны другие промеры, смотреть в `https://github.com/0374flop/slasm/tree/master/slasm-code`, тут я иногда оставляю мусор.