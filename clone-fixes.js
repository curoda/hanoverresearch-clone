/* clone-fixes.js — re-initialise Elementor Pro loop carousels that fail to auto-init on the
   statically-hosted clone (an async script-order race that manifests on fast CDN delivery but
   not on the challenge-delayed origin). Only touches loop swipers that Elementor did NOT already
   initialise, using each widget's own data-settings so slidesPerView / spacing / loop / autoplay /
   arrows / pagination match the origin exactly. Safe no-op when everything already initialised. */
(function () {
  function initLoops() {
    if (typeof window.Swiper !== 'function') return;
    var widgets = document.querySelectorAll(
      '.elementor-widget[data-widget_type^="loop-carousel"], .elementor-widget[data-widget_type^="loop-grid"]');
    widgets.forEach(function (w) {
      var c = w.querySelector('.elementor-loop-container.swiper, .swiper.elementor-loop-container');
      if (!c) return;
      if (c.classList.contains('swiper-initialized') || c.swiper) return;
      var s = {};
      try { s = JSON.parse(w.getAttribute('data-settings') || '{}'); } catch (e) {}
      // loop-grid uses "columns"; loop-carousel uses "slides_to_show"
      var per = parseInt(s.slides_to_show || s.columns || 1) || 1;
      var perT = parseInt(s.slides_to_show_tablet || s.columns_tablet || per) || per;
      var perM = parseInt(s.slides_to_show_mobile || s.columns_mobile || 1) || 1;
      var space = (s.image_spacing_custom && s.image_spacing_custom.size) ? s.image_spacing_custom.size : 30;
      var opts = {
        slidesPerView: perM,
        spaceBetween: space,
        loop: s.infinite === 'yes',
        speed: parseInt(s.speed || 500) || 500,
        breakpoints: { 768: { slidesPerView: perT }, 1025: { slidesPerView: per } }
      };
      if (s.autoplay === 'yes') opts.autoplay = { delay: parseInt(s.autoplay_speed || 5000) || 5000, disableOnInteraction: false };
      var pg = w.querySelector('.swiper-pagination');
      if (pg && s.pagination && s.pagination !== 'none') opts.pagination = { el: pg, clickable: true };
      var nx = w.querySelector('.elementor-swiper-button-next'), pv = w.querySelector('.elementor-swiper-button-prev');
      if (nx && pv && s.arrows === 'yes') opts.navigation = { nextEl: nx, prevEl: pv };
      try { new window.Swiper(c, opts); } catch (e) {}
    });
  }
  function run() { initLoops(); setTimeout(initLoops, 1200); setTimeout(initLoops, 3000); setTimeout(initLoops, 6000); }
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
