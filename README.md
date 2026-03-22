# SLASM
`https://github.com/0374flop/slasm` - ссылка на github репо.
## install
Установка - `npm i slasm-0374 -g`, ну или `npm i slasm-0374`.
Или если ты хочешь прямо жостка чета поделать то...
Если ты правда знаешь чего хочешь...
`https://github.com/0374flop/slasm/blob/master/slasm-tw18.sb3`.
Я предупреждал.
Ето tw(turbowarp) версия. Раньше я делал его на нем, но решил поприколу перейти на ts.
ПРЕДУПРЕЖДАЮ, там не все работает, что работает в ts версии.

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

Те коды что ниже могут НЕ работать. я не проверял их работо способность, но в tw версии они работают.
```
(clearstack)
(clog (JOIN Enter first number))
(W 1 (q))
(clearstack)
(clog (JOIN Enter operation: + - * /))
(W 2 (q))
(clearstack)
(clog (JOIN Enter second number))
(W 3 (q))
(clearstack)
(? (= (R 2) +) 89)
(? (= (R 2) -) 102)
(? (= (R 2) *) 115)
(? (= (R 2) /) 128)
(clog ?_неперекинул)
(jump 138)
(W 4 (+ (R 1) (R 3)))
(jump 138)
(W 4 (- (R 1) (R 3)))
(jump 138)
(W 4 (* (R 1) (R 3)))
(jump 138)
(W 4 (/ (R 1) (R 3)))
(clog (~ Result: (~ (S 0) (R 4))))
(clearstack)
(clog exit?)
(? (! (= (q) yes)) 1)
(clearstack)
(clog off.)
```

```
(W 1 (q))
(W 2 (q))
(W 3 (q))
(SO 27 (R 2))
(W 4 (1234 (R 1) (R 3)))
(clog (R 4))
```

```
(begin
  (W 1 (L 8 0))
  (W 2 (L 5 0))
  (W 3 (L 12 0))
  (W 4 (L 12 0))
  (W 5 (L 15 0))
  (W 6 (S 0))
  (W 7 (L 23 0))
  (W 8 (L 15 0))
  (W 9 (L 18 0))
  (W 10 (L 12 0))
  (W 11 (L 4 0))
  (W 12 (S 3))
  (clog (~ (R 1) (~ (R 2) (~ (R 3) (~ (R 4) (~ (R 5) (~ (R 6) (~ (R 7) (~ (R 8) (~ (R 9) (~ (R 10) (~ (R 11) (R 12))))))))))))))
```

Если нужны другие промеры, смотреть в `https://github.com/0374flop/slasm/tree/master/slasm-code`, тут я иногда оставляю мусор.