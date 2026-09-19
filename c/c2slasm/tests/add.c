int add(int a, int b) {
    return a + b;
}

int main() {
    int x;
    x = 0;
    int i;
    i = 0;
    while (i < 5) {
        x = add(x, i);
        i = i + 1;
    }
    return x;
}
