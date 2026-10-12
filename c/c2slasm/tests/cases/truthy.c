// expect: 15
// while (n) — число как условие
int main() {
    int n;
    n = 5;
    int s;
    s = 0;
    while (n) {
        s = s + n;
        n = n - 1;
    }
    return s;
}
