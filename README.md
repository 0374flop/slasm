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
  slasm <command> [args]

commands:
  run <file>     run a .slasm file
  eval <code>    evaluate inline SLASM code
  repl           interactive REPL
  parse <file|code>  parse and print instruction list
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

Подпрограммы:
```
(call (gln greet))
(clog "done")
(jump (gln end))
;-greet-;
(clog "Hello!")
(ret)
;-end-;
(clog "bye")
```

После последней метки должна быть хотя бы одна инструкция, иначе `jump` на неё выдаст `out of range`.

Если нужны другие промеры, смотреть в `https://github.com/0374flop/slasm/tree/master/slasm-code`, тут я иногда оставляю мусор.
