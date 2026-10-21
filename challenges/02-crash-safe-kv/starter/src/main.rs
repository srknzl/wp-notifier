use std::io::{self, BufRead, Write};

fn main() {
    let _data_dir = std::env::args().nth(1).expect("usage: kv <data_dir>");
    let stdin = io::stdin();
    let mut out = io::stdout().lock();
    for line in stdin.lock().lines() {
        let _line = line.expect("stdin");
        writeln!(out, "ERR not implemented").unwrap();
        out.flush().unwrap();
    }
}
