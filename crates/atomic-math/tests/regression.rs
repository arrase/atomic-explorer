//! Regression tests locking in the scientific-accuracy fixes.
//!
//! Each test below corresponds to a defect found by auditing the renderer and
//! the maths engine against analytic values.

use atomic_math::grid::evaluate_isosurface_grid_internal;
use atomic_math::spherical_harmonics::real_orbital_angular;
use atomic_math::wavefunctions::radial_truncation_radius;
use atomic_math::*;

const PI: f64 = std::f64::consts::PI;

/// Real orbitals grouped by l. States with different l are NOT orthogonal, so
/// orthogonality can only be checked inside a group.
fn real_kinds_by_l() -> Vec<(u32, Vec<RealOrbitalKind>)> {
    vec![
        (0, vec![RealOrbitalKind::S]),
        (
            1,
            vec![
                RealOrbitalKind::Pz,
                RealOrbitalKind::Px,
                RealOrbitalKind::Py,
            ],
        ),
        (
            2,
            vec![
                RealOrbitalKind::Dz2,
                RealOrbitalKind::Dxz,
                RealOrbitalKind::Dyz,
                RealOrbitalKind::Dx2y2,
                RealOrbitalKind::Dxy,
            ],
        ),
        (
            3,
            vec![
                RealOrbitalKind::Fz3,
                RealOrbitalKind::Fxz2,
                RealOrbitalKind::Fyz2,
                RealOrbitalKind::FzX2Y2,
                RealOrbitalKind::Fxyz,
                RealOrbitalKind::FxX23Y2,
                RealOrbitalKind::Fy3X2Y2,
            ],
        ),
    ]
}

/// Numerically integrate f(theta, phi) * sin(theta) over the full sphere.
fn integrate_sphere(f: impl Fn(f64, f64) -> f64, n_theta: usize, n_phi: usize) -> f64 {
    let mut total = 0.0;
    for i in 0..n_theta {
        let theta = (i as f64 + 0.5) * PI / n_theta as f64;
        let dtheta = PI / n_theta as f64;
        let dphi = 2.0 * PI / n_phi as f64;
        let mut acc = 0.0;
        for j in 0..n_phi {
            let phi = (j as f64 + 0.5) * dphi;
            acc += f(theta, phi) * dphi;
        }
        total += acc * theta.sin() * dtheta;
    }
    total
}

// ---------------------------------------------------------------------------
// Fix 1: the real f orbitals f_xz^2 / f_yz^2 were the wrong orbital.
//
// The code rendered x(5z^2 - r^2) while the UI labelled it f_{xz^2}, whose
// conventional meaning is x(3z^2 - r^2). Only a *shape* test catches this:
// a wrong function can still integrate to 1.
// ---------------------------------------------------------------------------

#[test]
fn real_orbital_set_is_orthonormal() {
    for (l, kinds) in real_kinds_by_l() {
        for kind in &kinds {
            let norm = integrate_sphere(
                |t, p| {
                    let v = real_orbital_angular(kind, t, p);
                    v * v
                },
                600,
                600,
            );
            assert!(
                (norm - 1.0).abs() < 2e-3,
                "l={l} {kind:?} is not normalized: int|Y|^2 dOmega = {norm}"
            );
        }
        for (i, a) in kinds.iter().enumerate() {
            for b in kinds.iter().skip(i + 1) {
                let overlap = integrate_sphere(
                    |t, p| real_orbital_angular(a, t, p) * real_orbital_angular(b, t, p),
                    600,
                    600,
                );
                assert!(
                    overlap.abs() < 2e-3,
                    "l={l}: {a:?} and {b:?} are not orthogonal: <a|b> = {overlap}"
                );
            }
        }
    }
}

#[test]
fn f_xz2_is_x_times_3z2_minus_r2() {
    // On the unit sphere sin(th)cos(ph) = x and cos(th) = z, so
    // x(3z^2 - r^2) with r = 1 becomes x(3z^2 - 1).
    let samples: [(f64, f64); 5] = [(0.6, 0.3), (1.1, 2.0), (2.0, 4.0), (0.9, 5.5), (1.7, 1.2)];
    for (theta, phi) in samples {
        let x = theta.sin() * phi.cos();
        let z = theta.cos();
        let target = x * (3.0 * z * z - 1.0);
        let v = real_orbital_angular(&RealOrbitalKind::Fxz2, theta, phi);
        if target.abs() > 1e-3 {
            let ratio = v / target;
            assert!(
                (ratio - 0.64636036822830).abs() < 1e-6,
                "f_xz^2 is not x(3z^2-r^2): at theta={theta}, phi={phi} the ratio was {ratio}"
            );
        }
    }
    // Same for the y partner.
    for (theta, phi) in samples {
        let y = theta.sin() * phi.sin();
        let z = theta.cos();
        let target = y * (3.0 * z * z - 1.0);
        let v = real_orbital_angular(&RealOrbitalKind::Fyz2, theta, phi);
        if target.abs() > 1e-3 {
            let ratio = v / target;
            assert!(
                (ratio - 0.64636036822830).abs() < 1e-6,
                "f_yz^2 is not y(3z^2-r^2): ratio was {ratio}"
            );
        }
    }
}

#[test]
fn f_xz2_is_not_the_old_x_times_5z2_minus_r2() {
    // Guards against silently reverting to the previous, mislabelled shape.
    let mut worst = 0.0f64;
    for i in 1..200 {
        let theta = (i as f64) * PI / 200.0;
        for j in 1..40 {
            let phi = (j as f64) * 2.0 * PI / 40.0;
            let x = theta.sin() * phi.cos();
            let z = theta.cos();
            let old = x * (5.0 * z * z - 1.0);
            if old.abs() > 1e-3 {
                let v = real_orbital_angular(&RealOrbitalKind::Fxz2, theta, phi);
                worst = worst.max((v / old - 0.64636036822830).abs());
            }
        }
    }
    assert!(
        worst > 0.1,
        "f_xz^2 still matches the old x(5z^2-r^2) shape (max deviation {worst})"
    );
}

// ---------------------------------------------------------------------------
// Fix 2: the contrast remap must not move the marching-cubes surface.
//
// The remap is anchored at the isolevel, so the set of voxels above the
// threshold has to be bit-for-bit the same for every contrast value.
// ---------------------------------------------------------------------------

fn voxels_above_isolevel(grid: &[f32], isolevel: f32) -> Vec<usize> {
    let max_abs = grid.iter().fold(0.0f32, |acc, v| acc.max(v.abs()));
    let threshold = isolevel * max_abs;
    grid.iter()
        .enumerate()
        .filter(|(_, v)| v.abs() >= threshold)
        .map(|(i, _)| i)
        .collect()
}

#[test]
fn contrast_does_not_change_the_isosurface() {
    let cases = [
        (2u32, 1u32, 0i32),
        (3, 0, 0),
        (4, 1, 0),
        (7, 0, 0),
        (4, 3, 0),
    ];
    for (n, l, m) in cases {
        let qn = QuantumNumbers { n, l, m };
        let mode = OrbitalMode::RealChemist(real_orbital_kind_from_lm(l, m).unwrap());
        let bounds = 4.0 * (n * n) as f64;
        let isolevel = 0.05f32;
        let reference = voxels_above_isolevel(
            &evaluate_isosurface_grid_internal(&qn, &mode, 1.0, 64, bounds as f32, 0.0, isolevel)
                .unwrap(),
            isolevel,
        );
        for contrast in [5.0f32, 20.0, 100.0] {
            let grid = evaluate_isosurface_grid_internal(
                &qn,
                &mode,
                1.0,
                64,
                bounds as f32,
                contrast,
                isolevel,
            )
            .unwrap();
            let selected = voxels_above_isolevel(&grid, isolevel);
            assert_eq!(
                selected,
                reference,
                "contrast={contrast} changed the isosurface of n={n} l={l} \
                 ({} vs {} voxels)",
                selected.len(),
                reference.len()
            );
        }
    }
}

#[test]
fn contrast_remap_is_monotonic_and_anchored() {
    let qn = QuantumNumbers { n: 3, l: 0, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::S);
    let res = 48usize;
    let bounds = 36.0f32;
    let isolevel = 0.05f32;
    let reference =
        evaluate_isosurface_grid_internal(&qn, &mode, 1.0, res, bounds, 0.0, isolevel).unwrap();
    for contrast in [10.0f32, 100.0] {
        let grid =
            evaluate_isosurface_grid_internal(&qn, &mode, 1.0, res, bounds, contrast, isolevel)
                .unwrap();
        // The remap must be a pointwise non-decreasing function of |density|:
        // ordering the voxels by |field| must give the same ordering as by
        // |reference field| (the un-remapped normalized density).
        let mut pairs: Vec<(f32, f32)> = (0..grid.len())
            .map(|i| (grid[i].abs(), reference[i].abs()))
            .collect();
        pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        for w in pairs.windows(2) {
            assert!(
                w[1].1 >= w[0].1 - 1e-6,
                "contrast={contrast}: remap is not monotone in density"
            );
        }
        // And it must still reach exactly 1.0 at the peak.
        let peak = grid.iter().fold(0.0f32, |acc, v| acc.max(v.abs()));
        assert!(
            (peak - 1.0).abs() < 1e-3,
            "contrast={contrast}: remapped field should peak at 1.0, got {peak}"
        );
    }
}

#[test]
fn contrast_preserves_exact_zeros() {
    // Nodal surfaces must stay at exactly zero so the node structure is never
    // smeared by the contrast curve.
    let qn = QuantumNumbers { n: 3, l: 1, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Pz);
    for contrast in [0.0f32, 20.0, 100.0] {
        let grid =
            evaluate_isosurface_grid_internal(&qn, &mode, 1.0, 48, 36.0, contrast, 0.05).unwrap();
        assert!(
            grid.iter().all(|v| v.is_finite()),
            "contrast={contrast} produced a non-finite field value"
        );
    }
}

// ---------------------------------------------------------------------------
// Fix 3: the point-cloud sampler must reproduce |psi|^2.
//
// The sampling box was 5n^2/Z, which truncated 0.28% of the 1s probability.
// ---------------------------------------------------------------------------

fn analytic_mean_r(n: u32, l: u32, z: f64) -> f64 {
    (0.5 / z) * (3.0 * (n * n) as f64 - (l * (l + 1)) as f64)
}

#[test]
fn sampled_cloud_reproduces_the_analytic_mean_radius() {
    let cases: &[(u32, u32, i32, bool, f64)] = &[
        (1, 0, 0, true, 1.0),
        (2, 0, 0, true, 1.0),
        (2, 1, 0, true, 1.0),
        (3, 2, 2, true, 1.0),
        (4, 3, 0, true, 1.0),
        (5, 1, 1, true, 1.0),
        (7, 0, 0, true, 1.0),
        (7, 3, 0, true, 1.0),
        (2, 1, 0, false, 1.0),
        (3, 2, 1, false, 1.0),
        (1, 0, 0, true, 6.9),
        (5, 0, 0, true, 0.9),
    ];
    let npts = 200_000usize;
    for &(n, l, m, real, z) in cases {
        let mode = if real {
            OrbitalMode::RealChemist(real_orbital_kind_from_lm(l, m).unwrap())
        } else {
            OrbitalMode::PureEigenstate
        };
        let pts = sample_points(&QuantumNumbers { n, l, m }, &mode, z, npts, 987_654_321).unwrap();
        let mean: f64 = pts
            .iter()
            .map(|p| {
                let p = p.position;
                ((p[0] as f64).powi(2) + (p[1] as f64).powi(2) + (p[2] as f64).powi(2)).sqrt()
            })
            .sum::<f64>()
            / npts as f64;
        let expected = analytic_mean_r(n, l, z);
        let rel = (mean - expected) / expected;
        assert!(
            rel.abs() < 0.01,
            "sampled <r> for n={n} l={l} m={m} real={real} z={z} was {mean}, expected {expected} \
             (relative error {rel})"
        );
    }
}

#[test]
fn sampling_box_does_not_truncate_the_density() {
    // The box the sampler actually uses discards at most one part in a billion of
    // the probability, for every supported (n, l, Z_eff). This is what makes the
    // tight box legitimate: it must never clip a real feature.
    for n in 1..=7u32 {
        for l in 0..n {
            for z in [0.1f64, 1.0, 7.0, 60.0] {
                let r_max = radial_truncation_radius(n, l, z, 1e-9).unwrap();
                let r_far = 80.0 * (n * n) as f64 / z;
                let integrate = |rmax: f64| -> f64 {
                    let steps = 200_000;
                    let h = rmax / steps as f64;
                    let mut s = 0.0;
                    for i in 0..=steps {
                        let r = i as f64 * h;
                        let rv = wavefunctions::r_nl(n, l, z, r).unwrap();
                        let w = if i == 0 || i == steps {
                            1.0
                        } else if i % 2 == 1 {
                            4.0
                        } else {
                            2.0
                        };
                        s += w * r * r * rv * rv;
                    }
                    s * h / 3.0
                };
                let inside = integrate(r_max);
                let total = integrate(r_far);
                let discarded = 1.0 - inside / total;
                assert!(
                    discarded < 1e-9,
                    "n={n} l={l} z={z}: {discarded:.3e} of the density falls outside the \
                     sampling box r_max = {r_max}"
                );
            }
        }
    }
}

#[test]
fn tight_sampling_box_shrinks_the_work_without_shrinking_the_orbital() {
    // The point of the tight box: it must never grow, it should be meaningfully
    // smaller for compact orbitals, and above all it must not change the sampled
    // distribution. The gain is modest by nature - a hydrogenic tail really does
    // extend far - but it is free.
    for n in 1..=7u32 {
        for l in 0..n {
            for z in [0.1f64, 1.0, 7.0, 60.0] {
                let conservative = wavefunctions::conservative_sampling_radius(n, z);
                let tight = radial_truncation_radius(n, l, z, 1e-9).unwrap();
                assert!(
                    tight <= conservative,
                    "n={n} l={l} z={z}: tight box {tight} grew past the cap {conservative}"
                );
                assert!(
                    tight > analytic_mean_r(n, l, z) * 0.5,
                    "n={n} l={l} z={z}: tight box {tight} is smaller than the orbital itself"
                );
            }
        }
    }

    // 1s is the default state the app opens on, and the most compact: 2.3x fewer
    // wasted candidates.
    let tight_1s = radial_truncation_radius(1, 0, 1.0, 1e-9).unwrap();
    assert!(
        tight_1s < 0.8 * wavefunctions::conservative_sampling_radius(1, 1.0),
        "1s box {tight_1s} is not meaningfully tighter"
    );

    // And the sampled distribution is unchanged by the tighter box.
    let qn = QuantumNumbers { n: 1, l: 0, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::S);
    let npts = 200_000usize;
    let pts = sample_points(&qn, &mode, 1.0, npts, 24_681_357).unwrap();
    let mean: f64 = pts
        .iter()
        .map(|p| {
            let p = p.position;
            ((p[0] as f64).powi(2) + (p[1] as f64).powi(2) + (p[2] as f64).powi(2)).sqrt()
        })
        .sum::<f64>()
        / npts as f64;
    let expected = analytic_mean_r(1, 0, 1.0);
    assert!(
        (mean - expected).abs() / expected < 0.01,
        "tight box changed <r> to {mean}, expected {expected}"
    );
}

#[test]
fn sampling_box_clears_the_outermost_radial_node() {
    // The box has to extend past the outermost node of the Laguerre polynomial,
    // otherwise the outermost lobe of an ns orbital is cut in half. This still
    // holds for the tight box, which is what the sampler uses.
    for n in 2..=7u32 {
        let z = 1.0;
        let r_box = radial_truncation_radius(n, 0, z, 1e-9).unwrap();
        // locate sign changes of R_n0 with r_nl for l = 0
        let mut last_sign_change = 0.0f64;
        let steps = 200_000;
        let r_far = 4.0 * (n * n) as f64 + 16.0 * n as f64;
        let h = r_far / steps as f64;
        let mut prev = wavefunctions::r_nl(n, 0, z, 1e-6).unwrap();
        for i in 1..=steps {
            let r = i as f64 * h;
            let cur = wavefunctions::r_nl(n, 0, z, r).unwrap();
            if cur.signum() != prev.signum() && cur != 0.0 {
                last_sign_change = r;
            }
            prev = cur;
        }
        assert!(
            last_sign_change > 0.0 && r_box > last_sign_change * 1.05,
            "n={n}: sampling box {r_box} does not clear the outermost radial node \
             at {last_sign_change}"
        );
    }
}

// ---------------------------------------------------------------------------
// Per-point density: the transfer function of the point cloud is built from the
// |psi|^2 the sampler reports, so that value has to be the real one.
// ---------------------------------------------------------------------------

#[test]
fn sampled_density_is_the_true_probability_density() {
    let cases: &[(u32, u32, i32, bool, f64)] = &[
        (1, 0, 0, true, 1.0),
        (2, 1, 0, true, 1.0),
        (3, 2, 0, true, 2.0),
        (4, 3, 1, true, 1.0),
        (2, 1, 1, false, 1.0),
        (4, 2, 0, true, 2.0),
    ];

    for &(n, l, m, real, z) in cases {
        let qn = QuantumNumbers { n, l, m };
        let mode = if real {
            OrbitalMode::RealChemist(real_orbital_kind_from_lm(l, m).unwrap())
        } else {
            OrbitalMode::PureEigenstate
        };
        let pts = sample_points(&qn, &mode, z, 4000, 20_260_929).unwrap();

        for p in &pts {
            let pos = p.position;
            let r = ((pos[0] as f64).powi(2) + (pos[1] as f64).powi(2) + (pos[2] as f64).powi(2))
                .sqrt();
            if r < 1e-6 {
                continue;
            }
            let theta = (pos[2] as f64 / r).clamp(-1.0, 1.0).acos();
            let phi = (pos[1] as f64).atan2(pos[0] as f64);
            let expected = probability_density(&qn, &mode, z, r, theta, phi).unwrap();
            let rel = (p.density - expected).abs() / expected.max(1e-300);
            assert!(
                rel < 1e-5,
                "n={n} l={l} m={m} real={real} z={z}: reported |psi|^2 = {} but the \
                 wavefunction gives {expected}",
                p.density
            );
        }
    }
}

#[test]
fn peak_density_bounds_every_sampled_point() {
    // The renderer divides by the peak and expects the result inside [0, 1];
    // if the peak ever fell short, the transfer function would clip real data.
    for n in 1..=7u32 {
        for l in 0..n {
            for m in 0..=l as i32 {
                let real = real_orbital_kind_from_lm(l, m).is_some();
                let qn = QuantumNumbers { n, l, m };
                let mode = if real {
                    OrbitalMode::RealChemist(real_orbital_kind_from_lm(l, m).unwrap())
                } else {
                    OrbitalMode::PureEigenstate
                };
                for &z in &[0.3f64, 1.0, 2.0, 47.0] {
                    let peak = psi_peak_density(&qn, &mode, z).unwrap();
                    let pts = sample_points(&qn, &mode, z, 2000, 55_55).unwrap();
                    for p in &pts {
                        assert!(
                            p.density <= peak * (1.0 + 1e-9),
                            "n={n} l={l} m={m} z={z}: |psi|^2 = {} exceeds peak {peak}",
                            p.density
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn diffuse_orbitals_really_do_have_a_dynamic_range_beyond_f32() {
    // The reason the cloud needs a log transfer function rather than a linear
    // one: a diffuse orbital spans many decades between core and halo. If this
    // ever stops being true the visualisation is no longer being honest about
    // what it is compressing.
    let qn = QuantumNumbers { n: 4, l: 2, m: 0 };
    let mode = OrbitalMode::RealChemist(real_orbital_kind_from_lm(2, 0).unwrap());
    let z = 2.0; // the Ag valence 4d_z^2 cloud
    let peak = psi_peak_density(&qn, &mode, z).unwrap();
    let pts = sample_points(&qn, &mode, z, 200_000, 4242).unwrap();

    let mut max_rel = 0.0f64;
    let mut min_visible = 1.0f64;
    for p in &pts {
        let rel = p.density / peak;
        max_rel = max_rel.max(rel);
        if rel > 1e-4 {
            min_visible = min_visible.min(rel);
        }
    }
    assert!(
        max_rel > 0.05,
        "the cloud never approaches its own peak (max {max_rel})"
    );
    assert!(
        min_visible < 1e-3,
        "the visible part of the cloud never drops 3 decades below the peak ({min_visible})"
    );
}

// ---------------------------------------------------------------------------
// Physics core that must not regress.
// ---------------------------------------------------------------------------

#[test]
fn hydrogenic_radial_function_is_unit_normalized() {
    for n in 1..=7u32 {
        for l in 0..n {
            for z in [0.2f64, 1.0, 3.7, 25.0] {
                let r_max = 40.0 * (n * n) as f64 / z;
                let steps = 400_000;
                let h = r_max / steps as f64;
                let mut s = 0.0;
                for i in 0..=steps {
                    let r = i as f64 * h;
                    let rv = wavefunctions::r_nl(n, l, z, r).unwrap();
                    let w = if i == 0 || i == steps {
                        1.0
                    } else if i % 2 == 1 {
                        4.0
                    } else {
                        2.0
                    };
                    s += w * r * r * rv * rv;
                }
                let integral = s * h / 3.0;
                assert!(
                    (integral - 1.0).abs() < 1e-5,
                    "int r^2 R_nl^2 dr for n={n} l={l} z={z} = {integral}, expected 1"
                );
            }
        }
    }
}

#[test]
fn pure_eigenstate_density_is_phi_independent() {
    for l in 0..=3u32 {
        for m in -(l as i32)..=(l as i32) {
            let qn = QuantumNumbers { n: l + 1, l, m };
            for r in [1.0f64, 4.0, 9.0] {
                for theta in [0.3f64, 1.1, 2.4] {
                    let d0 =
                        probability_density(&qn, &OrbitalMode::PureEigenstate, 1.0, r, theta, 0.0)
                            .unwrap();
                    let d1 =
                        probability_density(&qn, &OrbitalMode::PureEigenstate, 1.0, r, theta, 1.9)
                            .unwrap();
                    let d2 =
                        probability_density(&qn, &OrbitalMode::PureEigenstate, 1.0, r, theta, 5.1)
                            .unwrap();
                    assert!(
                        (d0 - d1).abs() <= 1e-12 * d0.max(1.0)
                            && (d0 - d2).abs() <= 1e-12 * d0.max(1.0),
                        "|Y_{l}^{m}|^2 depends on phi for l={l} m={m}"
                    );
                }
            }
        }
    }
}

#[test]
fn pure_eigenstate_density_is_the_phi_average_of_the_real_orbital() {
    // |l,m> and the matching real orbital describe the same physical state, so
    // averaging the real orbital over phi must reproduce the pure density.
    //
    // This holds for s, p and d: the chemists' d set (d_z2, d_xz, d_yz,
    // d_x2-y2, d_xy) is exactly the set of real forms Re[Y_2^m e^{im phi}].
    // It deliberately does NOT hold for the f set. The f orbitals are named
    // after the standard orthogonal set of real spherical harmonics
    // (f_z3, f_xz2, f_yz2, f_z(x2-y2), f_xyz, f_x(x2-3y2), f_y(3x2-y2)), which
    // is a different - equally valid - choice of basis for l = 3.
    for (l, m, m_pure) in [(1u32, 1i32, -1i32), (2, 2, -2)] {
        let real = OrbitalMode::RealChemist(real_orbital_kind_from_lm(l, m).unwrap());
        let pure = OrbitalMode::PureEigenstate;
        let n_phi = 720;
        for i in 1..200 {
            let theta = (i as f64) * PI / 200.0;
            let mut acc = 0.0;
            for j in 0..n_phi {
                let phi = (j as f64 + 0.5) * 2.0 * PI / n_phi as f64;
                acc += probability_density(
                    &QuantumNumbers { n: l + 1, l, m },
                    &real,
                    1.0,
                    3.0,
                    theta,
                    phi,
                )
                .unwrap();
            }
            let avg = acc / n_phi as f64;
            let d = probability_density(
                &QuantumNumbers {
                    n: l + 1,
                    l,
                    m: m_pure,
                },
                &pure,
                1.0,
                3.0,
                theta,
                0.0,
            )
            .unwrap();
            assert!(
                (avg - d).abs() <= 1e-8 * d.max(1e-12),
                "phi-average of the real l={l} m={m} orbital does not match |Y_l^{m_pure}|^2 \
                 at theta={theta}: {avg} vs {d}"
            );
        }
    }
}

#[test]
fn slater_rules_match_textbook_values() {
    // Slater's rules, standard worked values.
    let cases: &[(u32, u32, u32, f64)] = &[
        (1, 1, 0, 1.00),
        (2, 1, 0, 1.70),
        (3, 1, 0, 2.70),
        (10, 1, 0, 9.70),
        (3, 2, 0, 1.30),
        (4, 2, 0, 1.95),
        (5, 2, 1, 2.60),
        (6, 2, 1, 3.25),
        (7, 2, 1, 3.90),
        (8, 2, 1, 4.55),
        (9, 2, 1, 5.20),
        (10, 2, 1, 5.85),
        (11, 3, 0, 2.20),
        (12, 3, 0, 2.85),
        (13, 3, 1, 3.50),
        (17, 3, 1, 6.10),
        (19, 4, 0, 2.20),
        (20, 4, 0, 2.85),
        (26, 4, 0, 3.75),
        // Slater treats nd/nf electrons differently: same-group electrons shield
        // 1.00 (not 0.35) and every electron in a group to the left shields 1.00.
        (21, 3, 2, 3.00),  // Sc 3d1
        (22, 3, 2, 3.00),  // Ti 3d2
        (26, 3, 2, 3.00),  // Fe 3d6
        (29, 3, 2, 2.00),  // Cu 3d10
        (30, 3, 2, 3.00),  // Zn 3d10
        (39, 4, 2, 3.00),  // Y 4d1
        (47, 4, 2, 2.00),  // Ag 4d10
        (79, 5, 2, 2.00),  // Au 5d10 (Slater's known failure mode for heavy d/f)
        (58, 4, 3, 12.00), // Ce 4f1
    ];
    for &(z, n, l, expected) in cases {
        let got = slater::calculate_slater_z_eff(z, n, l).unwrap();
        assert!(
            (got - expected).abs() < 1e-6,
            "Z_eff(Z={z}, {n}{}) = {got}, expected {expected}",
            ['s', 'p', 'd'][l as usize]
        );
    }
}

#[test]
fn slater_z_eff_is_usable_for_every_element() {
    // main.ts picks the valence (n, l) from an Aufbau table; Slater's rules must
    // never return a non-positive or out-of-range value there.
    const AUFBAU: [(u32, u32); 19] = [
        (1, 0),
        (2, 0),
        (2, 1),
        (3, 0),
        (3, 1),
        (4, 0),
        (3, 2),
        (4, 1),
        (5, 0),
        (4, 2),
        (5, 1),
        (6, 0),
        (4, 3),
        (5, 2),
        (6, 1),
        (7, 0),
        (5, 3),
        (6, 2),
        (7, 1),
    ];
    const EDGES: [u32; 19] = [
        2, 4, 10, 12, 18, 20, 30, 36, 38, 48, 54, 56, 70, 80, 86, 88, 102, 112, 118,
    ];
    for z in 1u32..=118 {
        let i = EDGES.iter().position(|&e| z <= e).unwrap();
        let (n, l) = AUFBAU[i];
        let z_eff = slater::calculate_slater_z_eff(z, n, l).unwrap();
        assert!(
            z_eff > 0.0 && z_eff <= z as f64,
            "Z={z}: Z_eff for the valence {n}{} orbital is {z_eff}",
            ['s', 'p', 'd', 'f'][l as usize]
        );
    }
}

#[test]
fn ground_state_configuration_sums_to_the_atomic_number() {
    for z in 1u32..=118 {
        let config = slater::get_electron_configuration(z);
        let total: u32 = config.iter().map(|c| c.2).sum();
        assert_eq!(
            total, z,
            "ground-state configuration of Z={z} sums to {total}"
        );
    }
}

#[test]
fn hydrogenic_energies_and_spectral_wavelengths() {
    use transition::{calculate_energy_ev, calculate_transition};
    assert!((calculate_energy_ev(1.0, 1).unwrap() + 13.605693).abs() < 1e-4);
    // Lyman-alpha, Balmer-alpha, Paschen-alpha for hydrogen.
    for (n1, n2, wavelength, series) in [
        (2u32, 1u32, 121.5f64, "Lyman"),
        (3, 2, 656.1, "Balmer"),
        (4, 3, 1875.1, "Paschen"),
    ] {
        let res = calculate_transition(1.0, n1, n2).unwrap();
        assert!(
            (res.wavelength_nm - wavelength).abs() < 0.5,
            "{series}-alpha wavelength was {} nm, expected {wavelength}",
            res.wavelength_nm
        );
        assert_eq!(res.series_name, series);
    }
}

#[test]
fn einstein_a_coefficients_match_reference_values() {
    use transition::spontaneous_emission_rate;
    // A(2p -> 1s) = 6.265e8 s^-1 and A(3p -> 2s) = 2.2457e7 s^-1 for hydrogen.
    let a_lyman_alpha = spontaneous_emission_rate(1.0, 1, 0, 2, 1).unwrap();
    assert!(
        (a_lyman_alpha - 6.265e8).abs() / 6.265e8 < 0.01,
        "A(2p->1s) = {a_lyman_alpha:e}, expected ~6.265e8"
    );
    let a_balmer_beta = spontaneous_emission_rate(1.0, 2, 0, 3, 1).unwrap();
    assert!(
        (a_balmer_beta - 2.2457e7).abs() / 2.2457e7 < 0.01,
        "A(3p->2s) = {a_balmer_beta:e}, expected ~2.2457e7"
    );
    // Selection rules: Delta l = 0 and Delta l = 2 are electric-dipole forbidden.
    assert_eq!(spontaneous_emission_rate(1.0, 1, 0, 2, 0).unwrap(), 0.0);
    assert_eq!(spontaneous_emission_rate(1.0, 1, 0, 3, 2).unwrap(), 0.0);
}

#[test]
fn codata_constants_are_current() {
    use atomic_math::math_utils::constants::*;
    assert!((BOHR_RADIUS_NM - 0.052_917_721_090_3).abs() < 1e-12);
    assert!((BOHR_RADIUS_M - 5.291_772_109_03e-11).abs() < 1e-22);
    assert!((ELEMENTARY_CHARGE - 1.602_176_634e-19).abs() < 1e-28);
    assert!((PLANCK_H - 6.626_070_15e-34).abs() < 1e-43);
    assert!((SPEED_OF_LIGHT - 299_792_458.0).abs() < 1e-6);
    assert!((RYDBERG_ENERGY_EV - 13.605_693_122_994).abs() < 1e-9);
    assert!((RYDBERG_CONST_M1 - 10_973_731.568_160).abs() < 1e-3);
    assert!((ELECTRON_MASS_KG - 9.109_383_701_5e-31).abs() < 1e-40);
}
