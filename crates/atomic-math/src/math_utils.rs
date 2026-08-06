pub fn factorial(n: u32) -> f64 {
    (1..=n).fold(1.0, |acc, x| acc * (x as f64))
}

pub fn associated_laguerre(p: u32, q: u32, x: f64) -> f64 {
    match (p, q) {
        (0, _) => 1.0,
        (1, _) => (q + 1) as f64 - x,
        (2, _) => 0.5 * ((q + 1) as f64 * (q + 2) as f64 - 2.0 * ((q + 2) as f64) * x + x * x),
        (3, _) => {
            let q_f = q as f64;
            (1.0 / 6.0)
                * ((q_f + 1.0) * (q_f + 2.0) * (q_f + 3.0) - 3.0 * (q_f + 2.0) * (q_f + 3.0) * x
                    + 3.0 * (q_f + 3.0) * x * x
                    - x * x * x)
        }
        _ => {
            let mut l0 = 1.0;
            let mut l1 = (q + 1) as f64 - x;
            if p == 0 {
                return l0;
            }
            if p == 1 {
                return l1;
            }
            let mut lp = l1;
            for k in 1..p {
                let k_f = k as f64;
                let q_f = q as f64;
                let next = ((2.0 * k_f + 1.0 + q_f - x) * l1 - (k_f + q_f) * l0) / (k_f + 1.0);
                l0 = l1;
                l1 = next;
                lp = next;
            }
            lp
        }
    }
}

pub fn associated_legendre(l: u32, m: i32, x: f64) -> f64 {
    let m_abs = m.unsigned_abs();
    if m_abs > l {
        return 0.0;
    }

    match (l, m_abs) {
        (0, 0) => 1.0,
        (1, 0) => x,
        (1, 1) => -(1.0 - x * x).max(0.0).sqrt(),
        (2, 0) => 0.5 * (3.0 * x * x - 1.0),
        (2, 1) => -3.0 * x * (1.0 - x * x).max(0.0).sqrt(),
        (2, 2) => 3.0 * (1.0 - x * x),
        (3, 0) => 0.5 * (5.0 * x * x * x - 3.0 * x),
        (3, 1) => -1.5 * (5.0 * x * x - 1.0) * (1.0 - x * x).max(0.0).sqrt(),
        (3, 2) => 15.0 * x * (1.0 - x * x),
        (3, 3) => -15.0 * (1.0 - x * x).max(0.0).powf(1.5),
        _ => 0.0,
    }
}
