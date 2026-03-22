import slasm from "../interpreter";

export default function repl() {
    const code = slasm.ri.readlineSync('> ');
    if (code === null || code.toLowerCase() === 'exit') {
        console.log('--exit--');
        process.exit();
    }
    try {
        slasm.eval_slasm(code);
    } catch (error) {
        if (error instanceof Error) {
            console.log(error.message);
        } else {
            console.log(error);
        }
    }
}