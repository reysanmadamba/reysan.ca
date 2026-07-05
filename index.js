(function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // typewriter effect for hero prompt + heading
    if (!reduce) {
        var promptEl = document.getElementById('typePrompt');
        var headingEl = document.getElementById('typeHeading');

        function typeInto(el, text, speed, done) {
            el.textContent = '';
            var i = 0;
            var id = setInterval(function () {
                el.textContent += text.charAt(i);
                i++;
                if (i >= text.length) {
                    clearInterval(id);
                    if (done) done();
                }
            }, speed);
        }

        if (promptEl && headingEl) {
            var promptText = promptEl.textContent;
            var headingHTML = headingEl.innerHTML;
            var headingText = headingEl.textContent;

            typeInto(promptEl, promptText, 45, function () {
                setTimeout(function () {
                    typeInto(headingEl, headingText, 16, function () {
                        headingEl.innerHTML = headingHTML;
                    });
                }, 150);
            });
        }
    }

    // scroll progress
    var bar = document.getElementById('progress');
    function updateProgress() {
        var h = document.documentElement;
        var scrolled = h.scrollTop;
        var max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
    }
    document.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();

    // reveal on scroll
    if (!reduce && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('in');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    } else {
        document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    // active nav link on scroll
    var sections = ['about', 'projects', 'skills', 'contact'].map(function (id) {
        return document.getElementById(id);
    }).filter(Boolean);
    var navLinks = document.querySelectorAll('.navlinks a');
    function updateNav() {
        var pos = window.scrollY + 120;
        var current = null;
        sections.forEach(function (sec) {
            if (sec.offsetTop <= pos) current = sec.id;
        });
        navLinks.forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('href') === '#' + current);
        });
    }
    document.addEventListener('scroll', updateNav, { passive: true });
    updateNav();

    // subtle card tilt on hover
    if (!reduce && matchMedia('(hover:hover)').matches) {
        document.querySelectorAll('.card').forEach(function (card) {
            card.addEventListener('mousemove', function (e) {
                var r = card.getBoundingClientRect();
                var x = (e.clientX - r.left) / r.width - 0.5;
                var y = (e.clientY - r.top) / r.height - 0.5;
                card.style.transform = 'perspective(600px) rotateX(' + (-y * 3) + 'deg) rotateY(' + (x * 3) + 'deg) translateY(-2px)';
            });
            card.addEventListener('mouseleave', function () {
                card.style.transform = '';
            });
        });
    }
})();