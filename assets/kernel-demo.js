(() => {
  "use strict";

  const demo = document.querySelector("[data-kernel-demo]");
  if (!demo) return;
  const canvas = demo.querySelector("[data-kernel-plot]");
  const toggle = demo.querySelector("[data-kernel-toggle]");
  const status = demo.querySelector("[data-kernel-status]");
  const fallback = demo.querySelector("[data-kernel-fallback]");
  if (!canvas || !toggle || !status || !fallback) return;
  const copy = {
    en: {
      add: "Add an observation",
      remove: "Remove observation",
      added: "Observation added. Uncertainty narrows around the new point.",
      removed: "Observation removed. Uncertainty widens in the gap.",
      baseDescription: "Gaussian process posterior fitted to eight example observations. The 95% credible band widens in the data gap.",
      extraDescription: "Gaussian process posterior fitted to nine example observations. The new point in the gap narrows the 95% credible band around it."
    },
    zh: {
      add: "添加观测点",
      remove: "移除观测点",
      added: "已添加观测点，新点附近的可信区间收窄。",
      removed: "已移除观测点，数据空缺处的可信区间变宽。",
      baseDescription: "高斯过程后验根据八个示例观测点计算。数据空缺处的 95% 可信区间较宽。",
      extraDescription: "高斯过程后验根据九个示例观测点计算。在数据空缺处添加观测点后，该点附近的 95% 可信区间收窄。"
    }
  };
  let hasExtra = false;
  let hasInteracted = false;

  function updateCopy() {
    const labels = /^zh(?:-|$)/i.test(document.documentElement.lang) ? copy.zh : copy.en;
    fallback.alt = labels.baseDescription;
    canvas.setAttribute("aria-label", hasExtra ? labels.extraDescription : labels.baseDescription);
    toggle.textContent = hasExtra ? labels.remove : labels.add;
    if (hasInteracted) status.textContent = hasExtra ? labels.added : labels.removed;
  }

  updateCopy();
  new MutationObserver(updateCopy).observe(document.documentElement, { attributeFilter: ["lang"] });
  const context = canvas.getContext("2d");
  if (!context) return;

  const observations = [
    [0.065, -0.245], [0.14, 0.16], [0.235, 0.465], [0.33, 0.19],
    [0.66, -0.23], [0.75, 0.17], [0.86, 0.565], [0.94, 0.41]
  ];
  const extra = [0.495, 0.15];
  const signalVariance = 0.56 ** 2;
  const noiseVariance = 0.065 ** 2;
  const lengthScale = 0.13;

  function kernel(x, y) {
    return signalVariance * Math.exp(-0.5 * ((x - y) / lengthScale) ** 2);
  }

  function dot(a, b) {
    return a.reduce((sum, value, index) => sum + value * b[index], 0);
  }

  // Cholesky factor of the covariance of the eight noisy observations.
  const lower = observations.map(() => new Float64Array(observations.length));
  for (let i = 0; i < observations.length; i++) {
    for (let j = 0; j <= i; j++) {
      const covariance = kernel(observations[i][0], observations[j][0]);
      const residual = covariance - dot(lower[i], lower[j]);
      lower[i][j] = i === j ? Math.sqrt(residual + noiseVariance) : residual / lower[j][j];
    }
  }

  function solveLower(values) {
    const solution = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) {
      solution[i] = (values[i] - dot(lower[i], solution)) / lower[i][i];
    }
    return solution;
  }

  function projectedCovariance(x) {
    return solveLower(observations.map(([position]) => kernel(position, x)));
  }

  const targets = solveLower(observations.map(([, value]) => value));
  const extraCovariance = projectedCovariance(extra[0]);
  const extraVariance = signalVariance - dot(extraCovariance, extraCovariance) + noiseVariance;
  const extraResidual = extra[1] - dot(extraCovariance, targets);
  const samples = Array.from({ length: 181 }, (_, i) => {
    const x = 0.018 + 0.968 * i / 180;
    const covariance = projectedCovariance(x);
    const crossCovariance = kernel(x, extra[0]) - dot(covariance, extraCovariance);
    return {
      x,
      mean: dot(covariance, targets),
      variance: signalVariance - dot(covariance, covariance),
      meanChange: crossCovariance * extraResidual / extraVariance,
      varianceReduction: crossCovariance ** 2 / extraVariance
    };
  });

  let amount = 0;
  let frame = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function draw() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.round(bounds.width * pixelRatio);
    const height = Math.round(bounds.height * pixelRatio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.setTransform(width / bounds.width, 0, 0, height / bounds.height, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const pad = 7;
    const toX = x => pad + x * (bounds.width - 2 * pad);
    const toY = y => pad + (0.86 - y) / 1.87 * (bounds.height - 2 * pad);
    const ribbon = context.createLinearGradient(0, 0, bounds.width, 0);
    ribbon.addColorStop(0, "rgba(81, 152, 231, .24)");
    ribbon.addColorStop(0.48, "rgba(130, 135, 235, .42)");
    ribbon.addColorStop(1, "rgba(166, 142, 225, .26)");
    const ink = context.createLinearGradient(0, 0, bounds.width, 0);
    ink.addColorStop(0, "#3564ad");
    ink.addColorStop(0.46, "#4a49aa");
    ink.addColorStop(1, "#7652a4");

    context.beginPath();
    context.moveTo(0, toY(0));
    context.lineTo(bounds.width, toY(0));
    context.strokeStyle = "rgba(79, 87, 160, .22)";
    context.lineCap = "butt";
    context.setLineDash([2, 4]);
    context.lineWidth = 1;
    context.stroke();
    context.setLineDash([]);

    // At intermediate frames, the extra observation enters with increasing
    // precision. The endpoints are the exact eight- and nine-point posteriors.
    const curves = samples.map(sample => {
      const mean = sample.mean + amount * sample.meanChange;
      const variance = Math.max(0, sample.variance - amount * sample.varianceReduction);
      const radius = 1.96 * Math.sqrt(variance);
      return [toX(sample.x), toY(mean), toY(mean + radius), toY(mean - radius)];
    });
    context.beginPath();
    context.moveTo(curves[0][0], curves[0][2]);
    for (const [x, , upper] of curves) context.lineTo(x, upper);
    for (let i = curves.length - 1; i >= 0; i--) context.lineTo(curves[i][0], curves[i][3]);
    context.closePath();
    context.fillStyle = ribbon;
    context.fill();

    context.beginPath();
    context.moveTo(curves[0][0], curves[0][1]);
    for (const [x, y] of curves) context.lineTo(x, y);
    context.strokeStyle = ink;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.lineWidth = 2.5;
    context.stroke();

    function point([x, y], color, radius) {
      context.beginPath();
      context.arc(toX(x), toY(y), radius, 0, 2 * Math.PI);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = "#fff";
      context.lineWidth = 1.4;
      context.stroke();
    }
    for (const observation of observations) point(observation, "#3f4e93", 3.5);
    if (amount > 0) {
      context.globalAlpha = amount;
      point(extra, "#954776", 4.5);
      context.globalAlpha = 1;
    }
  }

  toggle.addEventListener("click", () => {
    hasExtra = !hasExtra;
    hasInteracted = true;
    updateCopy();
    const target = Number(hasExtra);
    const start = amount;
    const startedAt = performance.now();
    const duration = 340 * Math.abs(target - start);
    cancelAnimationFrame(frame);
    function animate(now) {
      const t = reducedMotion.matches || !duration ? 1 : Math.min(1, (now - startedAt) / duration);
      amount = start + (target - start) * t * t * (3 - 2 * t);
      draw();
      if (t < 1) frame = requestAnimationFrame(animate);
    }
    animate(startedAt);
  });

  canvas.hidden = false;
  fallback.hidden = true;
  toggle.hidden = false;
  draw();
  if ("ResizeObserver" in window) {
    new ResizeObserver(draw).observe(canvas);
  } else {
    window.addEventListener("resize", draw);
  }
})();
