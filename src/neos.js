(function ($) {
    var neosUrl = 'https://neos-server.org/neos/cgi-bin';
    $.extend($.fn, {

        /**
         * Get job.results using a form that contains the job number and password.
         * @param callback
         * @returns {jQuery}
         */
        NEOSResults: function (callback) {
            $.ajax({
                method: 'POST',
                url: neosUrl + '/results.cgi',
                data: this.serialize(),
                success: callback
            });
            return this
        },

        /**
         * Get results.txt (if it exists) using a form that contains the job number and password.
         * @param callback
         * @returns {jQuery}
         */
        NEOSResultsTxt: function (callback) {
            $.ajax({
                method: 'POST',
                url: neosUrl + '/results_txt.cgi',
                data: this.serialize(),
                success: callback
            });
            return this
        },
        
        /**
         * Because forms aren't handle the same across browsers, we're going to parse the forms ourselves. After
         * the form is parsed, submit data for NEOS job.
         * @param callback
         * @returns {jQuery}
         */
        NEOSSubmit: function (callback) {
            var data = {};
            var val;
            this.children().each(function (index, value) {
                $value = $(value);
                val = $value.val();
                if (!val)
                    val = $value.text();
                data[$value.attr('name')] = val
            });

            $.ajax({
                method: 'POST',
                url: neosUrl + '/submit.cgi',
                data: data,
                success: callback
            });
            return this
        },


        /**
         * Submit and wait for results.  This will write the current status of the job to HTML element 'status'.  Each
         * time NEOSResults is called, the callback function will be called.
         * @param status HTML element to have the current status of the job written to it.
         * @param callback fuction that is called each time the setInterval is ran.  Argument to callback will be the
         * json returned from the ajax call.
         */
        NEOSSubmitAndWait: function (status, callback) {
//            this.submit(function (event) { 
                $(this).NEOSSubmit(function (sub) {
                    status.text('Submitting');
                    if ('error' in sub) {
                        status.text(sub.error);
                        throw sub.error;
                    } else {
                        var interval = setInterval(function () {
                            NEOSResults(sub.job_number, sub.password, function (res) {
                                status.text(res.status);
                                if ('error' in res) {
                                    clearInterval(interval);
                                    status.text(res.error);
                                    throw res.error;
                                } else if (res.status === 'Done') {
                                    clearInterval(interval);
                                    callback(res);
                                }
                            })
                        }, 5000);
                    } 
//                });*/
            });
        }
    })
    ;
})(jQuery);

/**
 * Get job.result of a NEOS job. This can be used when there's no form to parse job number and password from.
 * @param job_number NEOS job number
 * @param password Job number's password
 * @param callback function called when results are retrieved. First argument will be the json returned from the ajax
 * call
 */
function NEOSResults(job_number, password, callback) {
    var input_password = $('<input name="password">').attr('value', password);
    var input_job_number = $('<input name="job_number">').attr('value', job_number);
    $('<form>')
        .append(input_password)
        .append(input_job_number).NEOSResults(callback);
}

/**
 * Get result.txt from a NEOS job, if it exists. This can be used when there's no form to parse job number and password from.
 * @param job_number NEOS job number
 * @param password Job number's password
 * @param callback function called when results are retrieved. First argument will be the json returned from the ajax
 * call
 */
function NEOSResultsTxt(job_number, password, callback) {
    var input_password = $('<input name="password">').attr('value', password);
    var input_job_number = $('<input name="job_number">').attr('value', job_number);
    $('<form>')
        .append(input_password)
        .append(input_job_number).NEOSResultsTxt(callback);
}

/**
 * Submit a job to NEOS using an xml from an URL.
 * @param url URL where job XML is located.
 * @param callback function called after job is submitted. First argument will be the json returned from the ajax
 * call
 */
function NEOSSubmitUrl(url, callback) {
    var input_url = $('<input name="url">').attr('value', url);
    $('<form>').append(input_url).NEOSSubmit(callback)
}

/**
 * Submit a job to NEOS using an xml stored in a string.
 * @param string Contains job XML in a string.
 * @param callback function called after job is submitted. First argument will be the json returned from the ajax
 * call
 */
function NEOSSubmitString(string, callback) {
    var input_string = $('<textarea name="string">').text(string);
    $('<form>').append(input_string).NEOSSubmit(callback)
}

/**
 * Submit a job to NEOS using an xml stored in a string and wait for the results.
 * @param string Contains job XML in a string.
 * @param status HTML element to have the current status of the job written to it.
 * @param callback function called after job is submitted. First argument will be the json returned from the ajax
 * call
 */
function NEOSSubmitStringAndWait(string, status, callback) {
    var input_string = $('<textarea name="string">').text(string);
    $('<form>').append(input_string).NEOSSubmitAndWait(status, callback)
}