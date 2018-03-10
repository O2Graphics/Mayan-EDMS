'use strict';

$.fn.hasAnyClass = function() {
    /*
     *  Return true is an element has any of the passed classes
     *  The classes are bassed as an array
     */
    for (var i = 0; i < arguments[0].length; i++) {
        if (this.hasClass(arguments[0][i])) {
            return true;
        }
    }
    return false;
}

var PartialNavigation = function (parameters) {
    parameters = parameters || {};

    // lastLocation - used as the AJAX referer
    this.lastLocation = null;

    // initialURL - the URL to send users when trying to access the / URL
    this.initialURL = parameters.initialURL || null;

    // excludeAnchorClasses - Anchors with any of these classes will not be processes as AJAX anchors
    this.excludeAnchorClasses = parameters.excludeAnchorClasses || [];

    // formBeforeSerializeCallbacks - Callbacks to execute before submitting an ajaxForm
    this.formBeforeSerializeCallbacks = parameters.formBeforeSerializeCallbacks || [];

    if (!this.initialURL) {
        alert('Need to setup initialURL');
    }
}

PartialNavigation.prototype.initialize = function () {
    this.setupAjaxAnchors();
    this.setupAjaxNavigation();
    this.setupAjaxForm();
}

PartialNavigation.prototype.filterLocation = function (newLocation) {
    /*
     * Method to validate new locations
     */
    var uri = new URI(newLocation);
    var currentLocation = new URI(location);

    if (uri.path() === '') {
        // href with no path remain in the same location
        // We strip the same location query and use the new href's one
        uri.path(
            new URI(currentLocation.fragment()).path()
        )
        return uri.toString();
    }

    if (uri.path() === '/') {
        // Root URL is not allowed
        return this.initialURL;
    }

    return newLocation;
}

PartialNavigation.prototype.loadAjaxContent = function (url) {
    /*
     *  Method to load and display partial backend views to the main
     *  view port.
     */
    var app = this;

    url = this.filterLocation(url);
    $.ajax({
        async: true,
        mimeType: 'text/html; charset=utf-8', // ! Need set mimeType only when run from local file
        url: url,
        type: 'GET',
        success: function (data, textStatus, response){
            if (response.status == 278) {
                // Handle redirects
                var newLocation = response.getResponseHeader('Location');

                app.setLocation(newLocation);
                app.lastLocation = newLocation;
            } else {
                app.lastLocation = url;
                if (response.getResponseHeader('Content-Disposition')) {
                    window.location = this.url;
                } else {
                    $('#ajax-content').html(data);
                }
            }
        },
        error: function (jqXHR, textStatus, errorThrown){
            app.processAjaxRequestError(jqXHR);
        },
        dataType: 'html',
    });
}

PartialNavigation.prototype.onAnchorClick = function ($this, event) {
    /*
     * Anchor click event manager. We intercept all click events and
     * route them to load the content via AJAX instead.
     */
    var url;

    if ($this.hasAnyClass(this.excludeAnchorClasses)) {
        return true;
    }

    url = $this.attr('href');
    if (url === undefined) {
        return true;
    }

    event.preventDefault();

    if ((url !== '#') && !($this.hasClass('disabled') || $this.parent().hasClass('disabled'))) {
        this.setLocation(url);
    }
}

PartialNavigation.prototype.processAjaxRequestError = function (jqXHR) {
    /*
     * Method to process an AJAX request and make it presentable to the
     * user.
     */

    if (jqXHR.status == 0) {
        $('#modal-server-error .modal-body').html($('#template-error').html());
        $('#modal-server-error').modal('show')
    } else {
        $('#ajax-content').html(jqXHR.responseText);
    }
}

PartialNavigation.prototype.setLocation = function (newLocation, pushState) {
    /*
     * Method to update the browsers history and trigger a page update.
     */

    // Validate the new location first.
    newLocation = this.filterLocation(newLocation);

    if (typeof pushState === 'undefined') {
        // Check if we should just load the content or load the content
        // and update the history.
        pushState = true;
    }

    var currentLocation = new URI(location);
    currentLocation.fragment(newLocation);

    if (pushState) {
        history.pushState({}, '', currentLocation);
    }
    this.loadAjaxContent(newLocation);
}

PartialNavigation.prototype.setupAjaxAnchors = function () {
    /*
     * Setup the new click event handler.
     */
    var app = this;
    $('body').on('click', 'a', function (event) {
        app.onAnchorClick($(this), event);
    });
}

PartialNavigation.prototype.setupAjaxForm = function () {
    /*
     * Method to setup the handling of form in an AJAX way.
     */
    var app = this;

    $('form').ajaxForm({
        async: true,
        beforeSerialize: function($form, options) {
            // Manage any callback registered to preprocess the form.
            $.each(app.formBeforeSerializeCallbacks, function (index, value) {
               value($form, options);
            });
        },
        beforeSubmit: function(arr, $form, options) {
            var uri = new URI(location);
            var uriFragment = uri.fragment();
            var url = $form.attr('action') || uriFragment;

            options.url = url;

            if ($form.attr('target') == '_blank') {
                // If the form has a target attribute we emulate it by
                // opening a new window and passing the form serialized
                // data as the query.
                window.open(
                    $form.attr('action') + '?' + decodeURIComponent($form.serialize())
                );

                return false;
            }
        },
        dataType: 'html',
        delegation: true,
        error: function(jqXHR, textStatus, errorThrown){
            app.processAjaxRequestError(jqXHR);
        },
        mimeType: 'text/html; charset=utf-8', // ! Need set mimeType only when run from local file
        success: function(data, textStatus, request){
            if (request.status == 278) {
                // Handle redirects after submitting the form
                var newLocation = request.getResponseHeader('Location');
                var uri = new URI(newLocation);
                var uriFragment = uri.fragment();
                var currentUri = new URI(window.location.hash);
                var currentUriFragment = currentUri.fragment();
                var url = uriFragment || currentUriFragment;

                app.setLocation(newLocation);
            } else {
                $('#ajax-content').html(data);
            }
        }
    });
}

PartialNavigation.prototype.setupAjaxNavigation = function () {
    /*
     * Setup the navigation method using the hash of the location.
     * Also handles the back button event and loads via AJAX any
     * URL in the location when the app first launches. Registers
     * a callback to send an emulated HTTP_REFERER so that the backends
     * code will still work without change.
     */
    var app = this;

    // Load ajax content when the hash changes
    if (window.history && window.history.pushState) {
        $(window).on('popstate', function() {
            var uri = new URI(location);
            var uriFragment = uri.fragment();
            app.setLocation(uriFragment, false);
        });
    }

    // Load any initial address in the URL of the browser
    if (window.location.hash) {
        var uri = new URI(window.location.hash);
        var uriFragment = uri.fragment();
        this.setLocation(uriFragment);
    } else {
        this.setLocation('/');
    }

    $.ajaxSetup({
        beforeSend: function (jqXHR, settings) {
            // Emulate the HTTP_REFERER.
            jqXHR.setRequestHeader('X-Alt-Referer', app.lastLocation);
        },
    });
}
