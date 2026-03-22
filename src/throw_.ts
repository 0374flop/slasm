import logger from "./output.js";

export default function throw_(error: string = 'Runtime', desc: string) {
    logger.error(`${error}Error : ${desc}`);
}

logger.on('error', (error: string) => {
    throw new Error(error);
});