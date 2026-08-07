pub fn factorial(n: u32) -> Result<f64, String> {
    if n > 170 {
        return Err("Factorial overflow for n > 170".into());
    }
    Ok((1..=n).fold(1.0, |acc, x| acc * (x as f64)))
}

pub fn associated_laguerre(p: u32, q: u32, x: f64) -> f64 {
    if p == 0 {
        return 1.0;
    }

    let q_f = q as f64;
    let mut l0 = 1.0;
    let mut l1 = (q_f + 1.0) - x;

    if p == 1 {
        return l1;
    }

    let mut lp = l1;
    for k in 1..p {
        let k_f = k as f64;
        let next = ((2.0 * k_f + 1.0 + q_f - x) * l1 - (k_f + q_f) * l0) / (k_f + 1.0);
        l0 = l1;
        l1 = next;
        lp = next;
    }
    lp
}

pub fn associated_legendre(l: u32, m: i32, x: f64) -> Result<f64, String> {
    let m_abs = m.unsigned_abs();
    if m_abs > l {
        return Err(format!(
            "Associated legendre order m ({}) cannot exceed degree l ({})",
            m_abs, l
        ));
    }
    if !(-1.0..=1.0).contains(&x) {
        return Err(format!("Domain error: x ({}) must be in [-1.0, 1.0]", x));
    }

    let mut p_mm = 1.0;
    if m_abs > 0 {
        let somx2 = ((1.0 - x) * (1.0 + x)).max(0.0).sqrt();
        let mut fact = 1.0;
        for _ in 1..=m_abs {
            p_mm *= -fact * somx2;
            fact += 2.0;
        }
    }

    if l == m_abs {
        return Ok(p_mm);
    }

    let mut p_mmp1 = x * (2 * m_abs + 1) as f64 * p_mm;
    if l == m_abs + 1 {
        return Ok(p_mmp1);
    }

    let mut p_l = 0.0;
    for k in (m_abs + 2)..=l {
        let k_f = k as f64;
        let m_f = m_abs as f64;
        p_l = ((2.0 * k_f - 1.0) * x * p_mmp1 - (k_f + m_f - 1.0) * p_mm) / (k_f - m_f);
        p_mm = p_mmp1;
        p_mmp1 = p_l;
    }

    Ok(p_l)
}

