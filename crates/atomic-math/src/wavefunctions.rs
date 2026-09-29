use crate::math_utils::{associated_laguerre, factorial, maximize_unimodal};

/// Hydrogenic radial wavefunction R_nl(r) given n, l, Z_eff, and r.
pub fn r_nl(n: u32, l: u32, z_eff: f64, r: f64) -> Result<f64, String> {
    if n == 0 {
        return Err("Principal quantum number n must be greater than 0".into());
    }
    if l >= n {
        return Err(format!(
            "Azimuthal quantum number l ({}) must be less than n ({})",
            l, n
        ));
    }
    if z_eff <= 0.0 {
        return Err(format!(
            "Effective nuclear charge Z_eff ({}) must be positive",
            z_eff
        ));
    }
    if r < 0.0 {
        return Err(format!("Radius r ({}) cannot be negative", r));
    }

    let z = z_eff;
    let zr = z * r;
    let n_f = n as f64;
    let rho = 2.0 * zr / n_f;

    let p = n - l - 1;
    let q = 2 * l + 1;

    let laguerre = associated_laguerre(p, q, rho);

    let num = (2.0 * z / n_f).powi(3) * factorial(n - l - 1)?;
    let den = 2.0 * n_f * factorial(n + l)?;
    let prefactor = (num / den).sqrt();

    let val = prefactor * (-zr / n_f).exp() * rho.powi(l as i32) * laguerre;
    Ok(val)
}

/// Computes the exact maximum of r^2 * [R_nl(r)]^2 over [0, r_max].
pub fn radial_density_max(n: u32, l: u32, z_eff: f64, r_max: f64) -> Result<f64, String> {
    let steps = 1000;
    let dr = r_max / (steps as f64);
    let mut a_max = 0.0;

    for i in 1..=steps {
        let r = (i as f64) * dr;
        let r_val = r_nl(n, l, z_eff, r)?;
        let val = r * r * r_val * r_val;
        if val > a_max {
            a_max = val;
        }
    }

    Ok(a_max)
}

/// Computes the maximum of [R_nl(r)]^2 over [0, r_max].
///
/// This is the reference level used to normalise |psi|^2 for rendering: the
/// probability density peaks at `radial_amplitude_max * angular_amplitude_max`,
/// so dividing by that product maps every point of the cloud onto [0, 1]. The
/// coarse scan only has to localise the peak; the golden-section pass then
/// pins it down, so the result is a true upper bound even for the very diffuse
/// high-n states where a fixed-step grid alone is a few parts in 1e5 short.
pub fn radial_amplitude_max(n: u32, l: u32, z_eff: f64, r_max: f64) -> Result<f64, String> {
    let steps = 4000;
    let dr = r_max / (steps as f64);
    let mut best = 0.0f64;
    let mut best_i = 0usize;

    for i in 0..=steps {
        let r = (i as f64) * dr;
        let r_val = r_nl(n, l, z_eff, r)?;
        let val = r_val * r_val;
        if val > best {
            best = val;
            best_i = i;
        }
    }

    let lo = ((best_i.saturating_sub(1)) as f64) * dr;
    let hi = ((best_i + 1).min(steps) as f64) * dr;
    if hi > lo {
        let probe = |r: f64| -> Result<f64, String> {
            let v = r_nl(n, l, z_eff, r)?;
            Ok(v * v)
        };
        // max_unimodal needs a plain FnMut, and r_nl returns a Result, so the
        // error is folded in: r_nl only fails for arguments validated above.
        let (_, refined) = maximize_unimodal(|r| probe(r).unwrap_or(0.0), lo, hi, 60);
        best = best.max(refined);
    }

    Ok(best)
}

/// Legacy upper bound on the sampling box, `(2n^2 + 16n) / Z_eff`.
///
/// It clears the outermost node and the exponential tail for every supported
/// state, but it is a very loose box for compact orbitals: for a 1s it is 18
/// Bohr radii around a cloud that is 1 Bohr radius across, so almost every
/// candidate the rejection sampler draws lands in empty space. Kept as the cap
/// for `radial_truncation_radius` so the truncation can never grow.
pub fn conservative_sampling_radius(n: u32, z_eff: f64) -> f64 {
    // Multiplied in f64: `n * n` in u32 would wrap for n above 65535, and the
    // WASM entry points accept any u32.
    let n_f = n as f64;
    (2.0 * n_f * n_f + 16.0 * n_f) / z_eff
}

/// Smallest radius that leaves at most `max_discarded` of the radial
/// probability outside, capped by `conservative_sampling_radius`.
///
/// Rejection sampling accepts a candidate with probability proportional to its
/// density, so every candidate drawn outside the true support is pure overhead.
/// Returning the tightest box that still keeps the truncation below
/// `max_discarded` makes the sampler spend its work where the electron is, which
/// is worth an order of magnitude in sampling time for compact orbitals.
pub fn radial_truncation_radius(
    n: u32,
    l: u32,
    z_eff: f64,
    max_discarded: f64,
) -> Result<f64, String> {
    let cap = conservative_sampling_radius(n, z_eff);
    let tolerance = max_discarded.clamp(0.0, 0.5);
    let steps = 4000usize;
    let dr = cap / (steps as f64);

    // Two streaming passes over the same grid, no allocation: this runs on every
    // point-cloud reload. The first integrates the radial probability to get the
    // total, the second locates the radius that reaches (1 - tolerance) of it.
    let mut total = 0.0f64;
    let mut previous = 0.0f64;
    for i in 0..=steps {
        let r = (i as f64) * dr;
        let r_val = r_nl(n, l, z_eff, r)?;
        let current = r * r * r_val * r_val;
        if i > 0 {
            total += 0.5 * (previous + current) * dr;
        }
        previous = current;
    }
    if total <= 0.0 {
        return Ok(cap);
    }

    let target = (1.0 - tolerance) * total;
    let mut cdf = 0.0f64;
    previous = 0.0;
    let mut crossing = cap;
    for i in 0..=steps {
        let r = (i as f64) * dr;
        let r_val = r_nl(n, l, z_eff, r)?;
        let current = r * r * r_val * r_val;
        if i > 0 {
            cdf += 0.5 * (previous + current) * dr;
        }
        previous = current;
        if cdf >= target {
            crossing = r;
            break;
        }
    }

    // The 2% margin absorbs the trapezoid error of the coarse grid. The crossing
    // is itself at least one step out, so no lower clamp is needed.
    Ok((crossing * 1.02).min(cap))
}

/// Smallest radius that encloses `quantile` of the electron probability.
///
/// The angular part of |psi|^2 integrates to 1 over the sphere, so the radial
/// cumulative of r^2 [R_nl(r)]^2 *is* the spherical cumulative distribution.
/// The result is a physically meaningful "size of the orbital" that, unlike a
/// fixed box, follows the orbital when n, l or Z_eff change.
pub fn radial_quantile_radius(n: u32, l: u32, z_eff: f64, quantile: f64) -> Result<f64, String> {
    let q = quantile.clamp(0.0, 1.0);
    let r_max = conservative_sampling_radius(n, z_eff);
    let steps = 8000;
    let dr = r_max / (steps as f64);

    // Streaming trapezoid: the cumulative only ever needs the previous cell, so
    // there is no 8001-entry CDF to allocate on every call.
    let mut total = 0.0f64;
    let mut previous = 0.0f64;
    for i in 0..=steps {
        let r = (i as f64) * dr;
        let r_val = r_nl(n, l, z_eff, r)?;
        let current = r * r * r_val * r_val;
        if i > 0 {
            total += 0.5 * (previous + current) * dr;
        }
        previous = current;
    }
    if total <= 0.0 {
        return Ok(r_max);
    }
    let target_cdf = q * total;

    // Second pass: the first cell that reaches the target, linearly interpolated
    // inside it so the answer is not quantised to the grid. If the target is
    // never reached the box itself is the answer.
    let mut cdf = 0.0f64;
    previous = 0.0;
    for i in 0..=steps {
        let r = (i as f64) * dr;
        let r_val = r_nl(n, l, z_eff, r)?;
        let current = r * r * r_val * r_val;
        if i > 0 {
            let next = cdf + 0.5 * (previous + current) * dr;
            if next >= target_cdf {
                let span = next - cdf;
                let t = if span > 0.0 {
                    (target_cdf - cdf) / span
                } else {
                    0.0
                };
                return Ok(((i - 1) as f64 + t.clamp(0.0, 1.0)) * dr);
            }
            cdf = next;
        }
        previous = current;
    }

    Ok(r_max)
}
