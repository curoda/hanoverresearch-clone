(function($) {
    $().on('facetwp-loaded', function() {
        if (FWP.loaded && 'undefined' !== typeof elementorFrontend) {
            jQuery('.facetwp-template, .facetwp-template .elementor-element').each(function() {
                elementorFrontend.elementsHandler.runReadyTrigger( jQuery(this) );
            });
        }
    });
    $().on('click', '.facetwp-template.elementor-widget-archive-posts .elementor-pagination a', function(e) {
        e.preventDefault();
        var matches = $(this).attr('href').match(/\/page\/(\d+)/);
        FWP.paged = null !== matches ? parseInt(matches[1]) : 1;
        FWP.soft_refresh = true;
        FWP.refresh();
    });
    $().on('click', '.facetwp-template.elementor-widget-posts .elementor-pagination a', function(e) {
        e.preventDefault();
        var matches = $(this).attr('href').match(/\/(\d+)/);
        FWP.paged = null !== matches ? parseInt(matches[1]) : 1;
        FWP.soft_refresh = true;
        FWP.refresh();
    });
    $().on('click', '.facetwp-template.elementor-widget-loop-grid .elementor-pagination a', function(e) {
        e.preventDefault();
        var matches = $(this).attr('href').match(/\/(\d+)/);
        FWP.paged = null !== matches ? parseInt(matches[1]) : 1;
        FWP.soft_refresh = true;
        FWP.refresh();
    });
    $().on('click', '.facetwp-template .woocommerce-pagination a', function(e) {
        e.preventDefault();
        var matches = $(this).attr('href').match(/product-page=(\d+)/);
        if (null !== matches) {
            FWP.paged = parseInt(matches[1]);
            FWP.soft_refresh = true;
            FWP.refresh();
        }
    });
    FWP.hooks.addFilter('facetwp/template_html', function(resp, params) {
        if (FWP.is_load_more) {
            var $html = $(params.html);

            var $element = '.elementor-grid';
            var $tpl = $html.find($element);
            if ($tpl.len() > 0) {
                FWP.is_load_more = false;
                $( '.facetwp-template '+$element).append($tpl.html());                
                return true;
            }

            $element = '.uael-post-grid__inner';
            $tpl = $html.find($element);
            if ($tpl.len() > 0) {
                FWP.is_load_more = false;
                $( '.facetwp-template '+$element).append($tpl.html());                
                return true;
            }

            $element = '.uael-woo-products-inner .products';
            $tpl = $html.find($element);
            if ($tpl.len() > 0) {
                FWP.is_load_more = false;
                $( '.facetwp-template '+$element).append($tpl.html());                
                return true;
            }

            $element = '.premium-blog-wrap';
            $tpl = $html.find($element);
            if ($tpl.len() > 0) {
                FWP.is_load_more = false;
                $( '.facetwp-template '+$element).append($tpl.html());                
                return true;
            }

            $element = '.premium-woo-products-inner .products';
            $tpl = $html.find($element);
            if ($tpl.len() > 0) {
                FWP.is_load_more = false;
                $( '.facetwp-template '+$element).append($tpl.html());                
                return true;
            }
            
            $element = '.jet-listing-grid__items';
            $tpl = $html.find($element);
            if ($tpl.len() > 0) {
                FWP.is_load_more = false;
                $( '.facetwp-template '+$element).append($tpl.html());                
                return true;
            }

        }        
        return resp;
    }, 1 );
})(fUtil);
