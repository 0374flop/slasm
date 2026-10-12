// expect: 123
// else if цепочка, return из середины функции
int classify(int x) {
    if (x < 0) return 1;
    else if (x == 0) return 2;
    else return 3;
}

int main() {
    int a;
    int b;
    int c;
    a = classify(-5);
    b = classify(0);
    c = classify(7);
    return a * 100 + b * 10 + c;
}
