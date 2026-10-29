// Mobile menu
const btn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');
btn.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
});
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  menu.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}));

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// "Apply Now" buttons pre-select the course
document.querySelectorAll('[data-course]').forEach(a => {
  a.addEventListener('click', () => {
    const sel = document.getElementById('course');
    const want = a.dataset.course.replace('&amp;', '&');
    for (const o of sel.options) { if (o.text === want) { sel.value = o.text; break; } }
  });
});


const form = document.getElementById('admForm');
const err = document.getElementById('formError');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = form.elements['name'].value.trim();
  const mobile = form.elements['mobile'].value.trim();
  const course = form.elements['course'].value;
  const msg = form.elements['msg'].value.trim();

  let problem = '';

  form.querySelectorAll('.invalid').forEach(el => {
    el.classList.remove('invalid');
  });

  if (name.length < 2) {
    problem = 'Please enter the student name.';
    form.elements['name'].classList.add('invalid');
  } else if (!/^[6-9][0-9]{9}$/.test(mobile)) {
    problem = 'Please enter a valid 10-digit mobile number.';
    form.elements['mobile'].classList.add('invalid');
  } else if (!course) {
    problem = 'Please select a class.';
    form.elements['course'].classList.add('invalid');
  }

  if (problem) {
    err.textContent = problem;
    err.hidden = false;
    return;
  }

  err.hidden = true;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await fetch('http://localhost:5000/api/admissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        phone: mobile,
        course,
        message: msg
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Unable to submit your enquiry.');
    }

    const text = `Hello, I want admission at Let's Talk English Class.\nName: ${name}\nMobile: ${mobile}\nClass: ${course}` +
      (msg ? `\nMessage: ${msg}` : '');

    window.open(
      'https://wa.me/918544333877?text=' + encodeURIComponent(text),
      '_blank',
      'noopener'
    );

    err.hidden = false;
    err.textContent = 'Enquiry saved successfully! WhatsApp is opening.';
    err.style.color = 'green';

    form.reset();
  } catch (error) {
    err.hidden = false;
    err.style.color = '';
    err.textContent = error.message === 'Failed to fetch'
      ? 'Cannot connect to the server. Please try again.'
      : error.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send on WhatsApp';
  }
});


// Subtle 3D tilt on cards (desktop only)
if (window.matchMedia('(hover:hover)').matches && !window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
  document.querySelectorAll('.tilt').forEach(c => {
    c.addEventListener('mousemove', e => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      c.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-4px)`;
    });
    c.addEventListener('mouseleave', () => { c.style.transform = ''; });
  });
}

// Scroll reveal
const targets = document.querySelectorAll('.card,.step,.why,.c-card,.photo-wrap,.form,.head');
targets.forEach(t => t.classList.add('reveal'));
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('show'); io.unobserve(en.target); }
  }), { threshold: .12 });
  targets.forEach(t => io.observe(t));
} else { targets.forEach(t => t.classList.add('show')); }
