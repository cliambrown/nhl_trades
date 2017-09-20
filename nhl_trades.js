var nhlTrades = (function() {

    // Load team logos
    $(document).ready(function() {
        $('.logo').each(function() {
            var $el = $(this);
            var team = $el.data('team');
            $el.addClass(team);
        });
    });
    
    var svgNS = 'http://www.w3.org/2000/svg'; // For creating new svg elements
    
    // Check for SVG support
    function supportsSVG() {
        return !!document.createElementNS && !!document.createElementNS(svgNS, 'svg').createSVGRect;
    }
    
    if(!supportsSVG()) {
        var img = document.createElement('img');
        img.setAttribute('src', '../img/nhl_trades-no-svg.png');
        img.setAttribute('width', '100%');
        img.style.width = '100%';
        img.setAttribute('height', '100%');
        img.style.height = '100%';

        $('#canvas-container').empty().append(img);
        $('#player-controls-wrapper').empty().html('Sorry, your browser does not support SVG animations. To see the interactive version of this page, download a modern browser like <a href="https://www.mozilla.org/firefox/" target="_blank">Firefox</a> or <a href="https://www.google.com/chrome/" target="_blank">Chrome</a>.');
        $('#filter-area').remove();
        $('#other-options-area').remove();
        
        // Don't bother proceeding, but return init function to avoid error
        return {
            init: function(arg) {
                return false;
            }
        };
    }
    
    var lineFadeTime = 1, // Time in s for lines to fade
        lineArcTime = 1, // Time in s for lines to complete arc across circle
        dayTime = 0.125, // time in s to increment by one day
        lines, // Holds an array of lines, each with 8 bezier coordinates + two counters
        linesCount, // Total number of background lines
        searchTimeout, // timeout for searching player names
        playerAutoCompAjax,
        $dropdownEl = $('#player-name-dropdown'),
        $playerButtons = $(), // List of current player buttons
        
        bgLines = [], // Background lines as DOM elements
        tradeCountEls = [], // Trade count divs as DOM elements
        dot = document.getElementById('dot'),
        dotPosition, // For tweening purposes
        scrubBar,
        loadingProgressBar,
        $centerMessage = $('#center-message'),
        tradeDateEl = document.getElementById('trade-date'),
        
        trades, // Array of individual trades as objects
        totalTrades, // Number of trades
        teamTradeCounts, // Number of transactions for each team
        maxTrades, // Max total trades per line
        baseOpacity, // Amount by which to increase opacity of grey lines after a trade
        tl = false, // GSAP TimelineLite
        tlTimeScale = 1,
        processedTrades, // How many trades have been processed (for loading progress bar animation)
        
        autoupdate = true,
        funQueue = [], // Function queue to avoid mixed-up ajax calls
        isUpdating = false,
        updateCancelled = false,
        currentGetDataAjax,
        ajaxDataDefault = {
            playerID: false,
            teamID: false,
            startDate: '2005-08-01',
            endDate: mysqlDateStrFromObj(),
            ioMode: 'all',
            animate: true,
            hideTypes: []
        },
        ajaxDataTemp = cloneObj(ajaxDataDefault), // Stores changes while other data is already loading
        ajaxData; // The data that gets sent by ajax
        
    // Initialize trade count els
    for(var i=1; i<=31; ++i) {
        tradeCountEls[i] = document.getElementById('trade-count-'+i);
    }
    
    // Initialize loading progress bar
    loadingProgressBar = new ProgressBar.Circle('#loading-progress', {
        color: '#263137',
        strokeWidth: 6,
        fill: 'transparent',
        text: { value: 'Loading...' },
        trailWidth: 6
    });
    loadingProgressBar.set(0);
    
    // Initialize scrub bar and player controls
    scrubBar = {
        active: false,
        moveEls: function(value) {
            var xPerc = 100 * value,
                barTransX = xPerc - 100;
            $('#handle').css('left', xPerc+'%');
            $('#progress-bar').css('transform', 'translate3d('+barTransX+'%, 0, 0)');
            var $aa = $('#animation-area');
            if(value == 1) $aa.addClass('finished');
            else {
                var classToAdd = (tl.paused() ? 'paused' : 'playing');
                $aa.removeClass('finished').addClass(classToAdd);
            }
        },
        userSetTo: function(value) {
            tl.progress(value);
            this.moveEls(value);
        },
        tlSetTo: function(value) {
            this.moveEls(value);
        },
        disable: function() {
            $('#progress-cell').removeClass('active');
            this.active = false;
        },
        enable: function() {
            $('#progress-cell').addClass('active');
            this.active = true;
        }
    };
    
    $('.datepicker').datepicker({
        dateFormat: 'M d, yy',
        minDate: 'Aug 1, 2005',
        maxDate: '0',
        altFormat: 'yy-mm-dd',
        currentText: 'Today',
        changeMonth: true,
        changeYear: true,
        yearRange: '2005:2017',
        onClose: function(dateText, inst) {
            updateDateRange();
        }
    });
    $('#start-date-picker').datepicker('option', 'altField', '#start-date');
    $('#end-date-picker').datepicker('option', 'altField', '#end-date');
    
    updateTeamID();
    handlePlayerIdAtLoad();
    udpateSpeed();
    updateDateRange(true);
    updateIOMode();
    updateTypes();
    updateDoAnimate();
    updateAutoupdate();
    updateShowNumbers();
    
    if(!autoupdate) {
        addLoadButton();
        toggleResetBtn();
    }
    
    // Keep circle (+ a bit of UI) visible in vertical direction
    resizeCircle();
    $(window).resize(function() {
        resizeCircle();
    });
    
    $('#progress-cell').mousedown(function(e1) {
        if(scrubBar.active) {
            var $el = $(this),
                $bar = $('#progress-background'),
                offset = $bar.offset(),
                x = e1.pageX - offset.left,
                xFrac = x / $bar.innerWidth(),
                wasPaused = tl.paused();
            if(xFrac < 0) xFrac = 0;
            else if(xFrac > 1) xFrac = 1;
            tl.pause();
            scrubBar.userSetTo(xFrac);
            
            $(document).on('mousemove', function(e2) {
                x = e2.pageX - offset.left;
                xFrac = x / $bar.innerWidth();
                if(xFrac < 0) xFrac = 0;
                else if(xFrac > 1) xFrac = 1;
                scrubBar.userSetTo(xFrac);
            });
            
            $(document).on('mouseup', function(e2) {
                if (!wasPaused) tl.resume();
                $(document).off('mousemove mouseup');
            });
        }
    });
    
    $('#cancel-loading').click(function() {
        updateCancelled = true;
        addLoadButton();
        $('#load').prop('disabled', false);
    })
    
    $('#play-pause').on('click', togglePlay);
    
    $('#goto-end').on('click', function() {
        tl.pause().progress(1);
    });
    
    $('.anim-speed').change(udpateSpeed);
    
    $('.logo').click(function() {
        var teamID = parseInt($(this).data('teamid')),
            currentTeamID = parseInt($('#team-id').val());
        if(teamID == currentTeamID) $('#team-id').val('0');
        else $('#team-id').val(teamID.toString());
        updateTeamID();
        triggerUpdate();
    });
    
    $('#player-name-input').on('input', function() {
        clearTimeout(searchTimeout);
        var searchStr = $(this).val().trim();
        clearDropdown();
        if(searchStr.length) {
            var $p = $('<p>').text('Searching...');
            $dropdownEl.append($p);
            searchTimeout = setTimeout(function() {
                autocompletePlayers(searchStr);
            }, 500);
        } else {
            handleEmptyPlayerSearch();
        }
    }).focus(function() {
        $dropdownEl.slideDown('fast');
    }).keydown(function(e) {
        if(e.which == 40) $dropdownEl.slideDown('fast', function() { playerBtnsKeyNav(e); });
        else playerBtnsKeyNav(e);
    });
    
    // Close menus and pop-ups on outside click/focus
    $(document).on('click', function(e) {
        if(!$(e.target).closest('#player-search-area').length) $dropdownEl.slideUp('fast');
        if(!$(e.target).closest('.info-tooltip-container').length) $('.info-tooltip-container').removeClass('show-tooltip');
    });
    $('*').on('focus', function(e) {
        if(!$(e.target).closest('#autocomplete-input-wrapper').length) $dropdownEl.slideUp('fast');
    });
    
    $('#player-clear-button').click(function() {
        clearPlayerFilter();
        triggerUpdate();
    });
    
    $('input[name="iomode"]').change(function() {
        updateIOMode();
        if(ajaxDataTemp.teamID) triggerUpdate();
        else toggleResetBtn();
    });
    
    $('.show-tooltip-button').click(function() {
        $(this).closest('.info-tooltip-container').toggleClass('show-tooltip');
    });
    
    $('.trans-type-toggle').change(function() {
        updateTypes();
        triggerUpdate();
    });
    
    $('#load').click(queueLoadNewData);
    
    $('#reset-filters').click(function() {
        ajaxDataTemp = $.extend(true, {}, ajaxDataDefault);
        ajaxDataTemp.animate = document.getElementById('do-animate').checked;
        clearPlayerFilter();
        $sdp = $('#start-date-picker');
        $edp = $('#end-date-picker');
        $sdp.datepicker('setDate', $sdp.datepicker('option', 'minDate'));
        $edp.datepicker('setDate', $edp.datepicker('option', 'maxDate'));
        $('input[name="iomode"]').val(['all']);
        $('#iomode-area').addClass('disabled');
        $('.trans-type-toggle').prop('checked', true);
        $('.logo.selected').removeClass('selected');
        triggerUpdate();
    });
    
    $('#do-animate').change(function() {
        updateDoAnimate();
        if(!ajaxDataTemp.animate && !autoupdate) {
            queueLoadNewData();
            $('#load').prop('disabled', false);
            updatePermalink();
        } else {
            triggerUpdate();
        }
    });
    
    $('#do-autoupdate').change(function() {
        updateAutoupdate();
        if(autoupdate) queueLoadNewData();
        else updateCancelled = true;
    });
    
    $('#do-show-numbers').change(updateShowNumbers);
    
    function udpateSpeed() {
        tlTimeScale = parseFloat($('.anim-speed:checked').val());
        if(tl) tl.timeScale(tlTimeScale);
    }
    
    // Uses the value of an input (rather than a js var) in order to get team at page load
    // Kinda clunky but ¯\_(ツ)_/¯
    function updateTeamID() {
        var teamID = parseInt($('#team-id').val());
        if(teamID < 1 || teamID > 31) teamID = ajaxDataDefault.teamID;
        ajaxDataTemp.teamID = teamID;
        $('.logo').removeClass('selected');
        if(ajaxDataTemp.teamID) {
            clearPlayerFilter();
            $('.logo.team-'+teamID).addClass('selected');
        }
    }
    
    function autocompletePlayers(searchStr) {
        if(playerAutoCompAjax) playerAutoCompAjax.abort();
        playerAutoCompAjax = $.ajax({
            method: 'post',
            url: '../scripts/nhl_player_autocomplete.php',
            data: {searchStr: searchStr},
            dataType: 'json',
            success: function(response) {
                showAutocomplete(response);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                // console.log(textStatus);
                // console.log(jqXHR.responseText);
                showAutocomplete(textStatus);
            }
        });
    }
    
    function clearDropdown() {
        $dropdownEl.text('');
        $playerButtons = $();
    }
    
    function handleEmptyPlayerSearch() {
        clearDropdown();
        var $p = $('<p>').text('Recommended:');
        $dropdownEl.append($p)
        var recPlayers = [
            {id: 303, name: 'Dominic Moore'},
            {id: 694, name: 'Lee Stempniak'},
            {id: 456, name: 'Aaron Johnson'}
        ];
        for(var i=0; i<recPlayers.length; ++i) {
            addPlayerFilterButton(recPlayers[i]);
        }
    }
    
    function showAutocomplete(response) {
        clearDropdown();
        if(Array.isArray(response)) {
            if(response.length) {
                for(var i=0; i<response.length; ++i) {
                    addPlayerFilterButton(response[i]);
                }
            } else {
                var $p = $('<p>').text('No transactions found matching that name.');
                $dropdownEl.append($p);
            }
        } else if(response !== 'abort') {
            var $p = $('<p>').text('Sorry, an error occurred.');
            $dropdownEl.append($p);
        }
    }
    
    function addPlayerFilterButton(player) {
        var $playerButton = $('<button>').attr('type', 'button').attr('tabindex', '-1').text(player.name);
        $playerButton.click(function() {
            filterByPlayer(player);
            triggerUpdate();
        }).keydown(function(e) {
            playerBtnsKeyNav(e);
        });
        $playerButtons = $playerButtons.add($playerButton);
        $dropdownEl.append($playerButton);
    }
    
    function playerBtnsKeyNav(e) {
        var keyCode = e.which;
        if(keyCode == 27) { // Escape
            $dropdownEl.slideUp('fast');
        } else if(keyCode == 38) { // Up
            e.preventDefault();
            playerBtnNav('prev');
        } else if(keyCode == 40) { // Down
            e.preventDefault();
            playerBtnNav('next');
        }
    }
    
    function playerBtnNav(dir) {
        var $currentBtn = $playerButtons.filter(':focus');
        if($currentBtn.length) {
            var currentBtnIndex = $playerButtons.index($currentBtn);
            if(dir === 'next' && currentBtnIndex < $playerButtons.length - 1) $playerButtons.eq(currentBtnIndex + 1).focus();
            else if(dir === 'prev') {
                if(currentBtnIndex == 0) $('#player-name-input').focus();
                else $playerButtons.eq(currentBtnIndex - 1).focus();
            }
        } else {
            if(dir === 'next' && $playerButtons.length) $playerButtons.first().focus();
        }
    }
    
    function filterByPlayer(player) {
        $dropdownEl.slideUp('fast', clearDropdown);
        $('#player-name-input').val(player.name).prop('disabled', true);
        $('#autocomplete-input-wrapper').addClass('has-selected');
        // ajaxDataTemp.teamID = ajaxDataDefault.teamID;
        $('#team-id').val('0');
        updateTeamID();
        ajaxDataTemp.playerID = player.id;
    }
    
    function handlePlayerIdAtLoad() {
        var playerID = parseInt($('#player-id').val());
        if(playerID > 0) ajaxDataTemp.playerID = playerID;
        else {
            $('#player-name-input').val('');
            handleEmptyPlayerSearch();
        }
    }
    
    function clearPlayerFilter() {
        ajaxDataTemp.playerID = ajaxDataDefault.playerID;
        $('#player-name-input').val('').prop('disabled', false);
        $('#autocomplete-input-wrapper').removeClass('has-selected');
        handleEmptyPlayerSearch();
    }
    
    function updateDateRange(isOnLoad) {
        if(typeof isOnLoad !== 'boolean') isOnLoad = false;
        var doUpdate = false,
            $sd = $('#start-date'),
            $ed = $('#end-date'),
            newStartDate = $sd.val(),
            newEndDate = $ed.val();
        // Check for default values
        if(newStartDate === $sd.data('defaultval')) newStartDate = ajaxDataDefault.startDate;
        if(newEndDate === $ed.data('defaultval')) newEndDate = ajaxDataDefault.endDate;
        // Only update if values have changed
        if(!isOnLoad) {
            if(newStartDate !== ajaxDataTemp.startDate) doUpdate = true;
            if(newEndDate !== ajaxDataTemp.endDate) doUpdate = true;
        }
        ajaxDataTemp.startDate = newStartDate;
        ajaxDataTemp.endDate = newEndDate;
        if(doUpdate) triggerUpdate();
        // Change max and min date values on datepickers
        var $sdp = $('#start-date-picker'),
            $edp = $('#end-date-picker');
        $sdp.datepicker('option', 'maxDate', $edp.val());
        if($sdp.datepicker('option', 'maxDate').trim() === '') $sdp.datepicker('option', 'maxDate', '0');
        $edp.datepicker('option', 'minDate', $sdp.val());
        if($edp.datepicker('option', 'minDate').trim() === '') $edp.datepicker('option', 'minDate', 'Aug 1, 2005');
    }
    
    function updateIOMode() {
        ajaxDataTemp.ioMode = $('input[name="iomode"]:checked').val();
        updatePermalink();
    }
    
    function updateTypes() {
        ajaxDataTemp.hideTypes = [];
        $('.trans-type-toggle').each(function() {
            var typeID = this.dataset.typeid;
            if(!this.checked) ajaxDataTemp.hideTypes.push(typeID);
        });
    }
    
    function toggleResetBtn() {
        if(isAjaxDataDefault()) $('#reset-filters').prop('disabled', true);
        else $('#reset-filters').prop('disabled', false);
    }
    
    function isAjaxDataDefault() {
        var attrVal;
        for(var attr in ajaxDataTemp) {
            if(!ajaxDataTemp.hasOwnProperty(attr) || attr === 'animate') continue;
            attrVal = ajaxDataTemp[attr];
            if(Array.isArray(attrVal)) {
                if(attrVal.length) return false;
            }
            else if(attrVal !== ajaxDataDefault[attr]) return false;
        }
        return true;
    }
    
    function updateDoAnimate() {
        ajaxDataTemp.animate = document.getElementById('do-animate').checked;
        if(ajaxDataTemp.animate) $('#speed-list').removeClass('disabled');
        else $('#speed-list').addClass('disabled');
    }
    
    function updateAutoupdate() {
        autoupdate = document.getElementById('do-autoupdate').checked;
        if(!autoupdate) $('#load').prop('disabled', false);
        updatePermalink();
    }
    
    function addLoadButton() {
        $loadBtn = $('<button>', {id: 'dynamic-load-btn'}).attr('type', 'button').text('Load').click(queueLoadNewData);
        $centerMessage.text('').append($loadBtn).addClass('show');
    }
    
    function updateShowNumbers() {
        if(document.getElementById('do-show-numbers').checked) $('#circle').addClass('show-numbers');
        else $('#circle').removeClass('show-numbers');
        updatePermalink();
    }
    
    function triggerUpdate() {
        if(autoupdate) queueLoadNewData();
        else $('#load').prop('disabled', false);
        updatePermalink();
    }
    
    function updatePermalink() {
        var attrVal, len, i,
            url = 'https://cliambrown.com/nhl_trades/'
            params = [];
        for(var attr in ajaxDataTemp) {
            if(!ajaxDataTemp.hasOwnProperty(attr)) continue;
            attrVal = ajaxDataTemp[attr];
            if(attr === 'animate') {
                if(!attrVal) params.push('animate=false');
                continue;
            }
            if(Array.isArray(attrVal)) {
                len = attrVal.length;
                if(len) {
                    for(i=0; i<len; ++i) {
                        params.push(attr+'[]='+encodeURIComponent(attrVal[i]));
                    }
                }
                continue;
            }
            if(attrVal !== ajaxDataDefault[attr]) params.push(attr+'='+encodeURIComponent(attrVal));
        }
        if(!$('#circle').hasClass('show-numbers')) params.push('showNumbers=false');
        if(!autoupdate) params.push('autoupdate=false');
        if(params.length) url += '?' + params.join('&');
        $('#filter-permalink').val(url);
    }
    
    function queueLoadNewData() {
        if(tl) {
            tl.pause().kill();
            tl = false;
        }
        $('#animation-area').removeClass('playing finished').addClass('paused');
        $('.play-control-btn').prop('disabled', true);
        $('#canvas-container').off('click');
        scrubBar.disable();
        $centerMessage.text('').removeClass('show');
        tradeDateEl.innerHTML = '';
        $('.trade-count').css('visibility', 'hidden');
        toggleResetBtn();
        // Cancel previous request
        if(currentGetDataAjax) currentGetDataAjax.abort();
        // Add to queue if necessary
        if(isUpdating) {
            updateCancelled = true;
            funQueue = [loadNewData];
        }
        else loadNewData();
    }
    
    function loadNewData() {
        isUpdating = true;
        updateCancelled = false;
        $('#load').prop('disabled', true);
        
        loadingProgressBar.set(0);
        loadingProgressBar.setText('Loading...');
        document.getElementById('loading-progress-container').style.visibility = 'visible';
        
        $('#canvas .anim-line').remove();
        dot.style.visibility = 'hidden';
        for(var i=0; i<linesCount; ++i) {
            bgLines[i].style.opacity = 0;
            bgLines[i].style.visibility = 'hidden';
        }
        $('#canvas').show();
        
        if(ajaxDataTemp.animate) {
            tl = new TimelineLite({paused: true, onStart: onTlStart, onUpdate: onTlUpdate, onComplete: onTlComplete});
            tl.timeScale(tlTimeScale);
        }
        
        trades = [];
        processedTrades = 0;
        
        for(i=0; i<linesCount; ++i) {
            lines[i].totalTrades = 0;
            lines[i].animatedTrades = 0;
        }
        
        getData();
        
    }
    
    function getData() {
        ajaxData = cloneObj(ajaxDataTemp);
        var jsonString = JSON.stringify(ajaxData);
        currentGetDataAjax = $.ajax({
            method: 'post',
            url: '../scripts/nhl_get_data.php',
            data: {data : jsonString},
            dataType: 'script',
            success: function(response) {
                // console.log(response);
                totalTrades = trades.length;
                if(!totalTrades) handleUpdateError('No transactions found matching those filters.', false, null);
                else processData();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                // console.log(jqXHR);
                // console.log(errorThrown);
                console.log(textStatus);
                console.log(jqXHR.responseText);
                handleUpdateError('Sorry, something went wrong.', true, textStatus);
            }
        });
    }
    
    function handleUpdateError(errMsg, doTryAgain, textStatus) {
        document.getElementById('loading-progress-container').style.visibility = 'hidden';
        if(textStatus !== 'abort') {
            $centerMessage.text(errMsg);
            if(doTryAgain) {
                var $br = $('<br>'),
                    $tryAgainBtn = $('<button>', {id: 'try-again'}).attr('type', 'button').text('Try Again?').click(queueLoadNewData);
                $centerMessage.append($br, $tryAgainBtn);
            }
            $centerMessage.addClass('show');
        }
        isUpdating = false;
        updateCancelled = false;
        dereferenceVars();
        if(funQueue.length) (funQueue.shift())();
    }
    
    // A js pseudo-class for animate coloured svg lines
    function AnimLine(properties) {
        var animLine = document.createElementNS(svgNS, 'path'),
            line = properties.line;
        animLine.setAttribute('d', 'M'+line.x0+' '+line.y0+' C '+line.cp1x+' '+line.cp1y+', '+line.cp2x+' '+line.cp2y+', '+line.x1+' '+line.y1);
        animLine.setAttribute('class', 'anim-line type-'+properties.typeID);
        animLine.style.visibility = 'hidden';
        animLine.style.opacity = 1;
        if(properties.doDash) {
            var pathLength = animLine.getTotalLength();
            animLine.style.strokeDasharray = pathLength + ' ' + pathLength;
            animLine.style.strokeDashoffset = pathLength;
        }
        document.getElementById('canvas').append(animLine);
        return animLine
    }
    
    function processData() {
        var i;
        
        if(updateCancelled) {
            handleUpdateError('', false, 'abort');
            return false;
        }
        
        loadingProgressBar.setText('Processing...');
        
        if(ajaxData.playerID) {
            
            if(ajaxData.animate) {
                
                /* Player Animation */
                
                tl.set(dot.style, {visibility: 'visible'}, 0);
                
                var trade, lineIndex, line, animLine, tweenPos, lineTween, dotTween, dateStr;
                dotPosition = {x: 0, y: 0};
                for(i=0; i<totalTrades; ++i) {
                    trade = trades[i];
                    lineIndex = getLineIndex(trades[i]);
                    line = lines[lineIndex];
                    if(trade.reverse) line = getBackwardsLine(line);
                    
                    animLine = new AnimLine({line: line, typeID: trade.typeID, doDash: true});
                    tweenPos = i * lineArcTime;
                    lineTween = TweenLite.to(animLine.style, lineArcTime, {strokeDashoffset: 0});
                    
                    var path = [
                        {x: line.x0, y: line.y0},
                        {x: line.cp1x, y: line.cp1y},
                        {x: line.cp2x, y: line.cp2y},
                        {x: line.x1, y: line.y1}
                    ];
                    dotTween = TweenLite.to(dotPosition, lineArcTime, {bezier:{type: 'cubic', values: path}, onUpdate:moveDot});
                    
                    dateStr = dateStrFromObj(dateObjFromMysqlStr(trade.date));
                    tl.set(tradeDateEl, {text: dateStr}, tweenPos)
                        .set(animLine.style, {visibility: 'visible'}, tweenPos)
                        .add(lineTween, tweenPos)
                        .set(dot, {className: 'type-'+trade.typeID}, tweenPos)
                        .add(dotTween, tweenPos);
                }
                finishedAnimationProcessing();
                
            } else {
                
                /* Player Non-Animation */
                
                var trade, svgLine;
                for(i=0; i<totalTrades; ++i) {
                    trade = trades[i];
                    svgLine = new AnimLine({line: lines[getLineIndex(trades[i])], typeID: trade.typeID});
                    svgLine.style.visibility = 'visible';
                }
                document.getElementById('loading-progress-container').style.visibility = 'hidden';
                isUpdating = false;
                dereferenceVars();
                
            }
            
        } else {
            
            for(i=0; i<linesCount; ++i) {
                bgLines[i].style.visibility = 'visible';
            }
            
            teamTradeCounts = newFilledArray(32, 0);
            $('.trade-count').text('0');
            
            if(ajaxData.animate) {
                
                /* Full Animation */
                
                // Add date-changing to timeline
                var animDate = dateObjFromMysqlStr(ajaxData.startDate),
                    endDate = dateObjFromMysqlStr(ajaxData.endDate),
                    tweenPos = 0,
                    dateStr;
                while(animDate <= endDate) {
                    dateStr = dateStrFromObj(animDate);
                    tl.set(tradeDateEl, {text: dateStr}, tweenPos);
                    animDate.setDate(animDate.getDate() + 1);
                    tweenPos += dayTime;
                }
                // Calculate total trades per line
                var lineIndex;
                for(i=0; i<totalTrades; ++i) {
                    lineIndex = getLineIndex(trades[i]);
                    trades[i].lineIndex = lineIndex;
                    ++lines[lineIndex].totalTrades;
                }
                // Find the maximum trades per line
                maxTrades = 0;
                for(i=0; i<linesCount; ++i) {
                    if(lines[i].totalTrades > maxTrades) maxTrades = lines[i].totalTrades;
                }
                // Set team trades to zero at start of animation
                for(i=1; i<=31; ++i) {
                    tl.set(tradeCountEls[i], {text: '0'}, 0);
                }
                baseOpacity = 1 / maxTrades;
                processLargeArrayAsync(trades, processTrade, finishedAnimationProcessing);
                
            } else {
                
                /* Full Non-Animation */
                
                // Get total trades per line and find the maximum trades per line
                var trade, lineIndex, tradesPerLine;
                maxTrades = 0;
                for(i=0; i<totalTrades; ++i) {
                    trade = trades[i];
                    lineIndex = getLineIndex(trade);
                    tradesPerLine = trades[i].totalTrades;
                    lines[lineIndex].totalTrades = tradesPerLine;
                    if(tradesPerLine > maxTrades) maxTrades = tradesPerLine;
                    teamTradeCounts[trade.team0] += tradesPerLine;
                    teamTradeCounts[trade.team1] += tradesPerLine;
                }
                baseOpacity = 1 / maxTrades;
                // Set this line's opacity
                for(i=0; i<linesCount; ++i) {
                    bgLines[i].style.opacity = baseOpacity * lines[i].totalTrades;
                }
                for(i=1; i<=31; ++i) {
                    tradeCountEls[i].innerHTML = teamTradeCounts[i];
                    if(teamTradeCounts[i] > 0) tradeCountEls[i].style.visibility = 'visible';
                }
                $('.trade-count').css('visibility', 'visible');
                document.getElementById('loading-progress-container').style.visibility = 'hidden';
                isUpdating = false;
                dereferenceVars();
                
            }
            
        }
    }
    
    function getBackwardsLine(line) {
        return {
            x0: line.x1,
            y0: line.y1,
            cp1x: line.cp2x,
            cp1y: line.cp2y,
            cp2x: line.cp1x,
            cp2y: line.cp1y,
            x1: line.x0,
            y1: line.y0
        };
    }
    
    function moveDot() {
        dot.setAttribute('cx', dotPosition.x);
        dot.setAttribute('cy', dotPosition.y);
    }
    
    // Process large array without hanging browser
    function processLargeArrayAsync(array, fn, callback) {
        var maxTimePerChunk = 100,
            index = 0,
            context = window;
        function now() {
            return new Date().getTime();
        }
        function doChunk() {
            if(updateCancelled) {
                handleUpdateError('', false, 'abort');
                return false;
            }
            var startTime = now();
            while(index < array.length && now() - startTime <= maxTimePerChunk) {
                fn.call(context, array[index]);
                ++index;
            }
            if(index < array.length) setTimeout(doChunk, 1);
            else callback.call();
        }    
        doChunk();    
    }
    
    function processTrade(trade) {
        
        var lineIndex = trade.lineIndex,
            line = lines[lineIndex],
            tweenPos = trade.dayIndex * dayTime,
            animLine = new AnimLine({line: line, typeID: trade.typeID}),
            lineTween = TweenLite.to(animLine.style, lineFadeTime, {opacity: 0,  ease: Power1.easeOut}),
            team0 = trade.team0,
            team1 = trade.team1;
        
        if(tweenPos == 0) tweenPos = 0.01;
        
        ++teamTradeCounts[team0];
        ++teamTradeCounts[team1];
        if(teamTradeCounts[team0] == 1) tl.set(tradeCountEls[team0].style, {visibility: 'visible'}, tweenPos);
        if(teamTradeCounts[team1] == 1) tl.set(tradeCountEls[team1].style, {visibility: 'visible'}, tweenPos);
        
        ++processedTrades;
        
        ++line.animatedTrades;
        var team0count = teamTradeCounts[team0].toString(),
            team1count = teamTradeCounts[team1].toString(),
            currentOpacity = line.animatedTrades * baseOpacity,
            bgLine = bgLines[lineIndex];
        
        tl.set(tradeCountEls[team0], {text: team0count}, tweenPos)
            .set(tradeCountEls[team1], {text: team1count}, tweenPos)
            .set(animLine.style, {visibility: 'visible'}, tweenPos)
            .add(lineTween, tweenPos)
            .set(bgLine.style, {opacity: currentOpacity}, tweenPos)
            .set(animLine.style, {visibility: 'hidden'}, tweenPos+lineFadeTime);
        
        var processedPerc = processedTrades/totalTrades,
            processedPercStr = Math.round(100 * processedPerc) + '%';
        loadingProgressBar.set(processedPerc);
        loadingProgressBar.setText(processedPercStr);
    }
    
    function finishedAnimationProcessing() {
        if(updateCancelled) {
            handleUpdateError('', false, 'abort');
            return false;
        }
        onTlUpdate();
        document.getElementById('loading-progress-container').style.visibility = 'hidden';
        $('.play-control-btn').prop('disabled', false);
        $('#canvas-container').on('click', togglePlay);
        $centerMessage.text('Click to play').addClass('show');
        scrubBar.enable();
        isUpdating = false;
        dereferenceVars();
    }
    
    // De-reference global variables for garbage collection
    function dereferenceVars() {
        trades = null;
        ajaxData = null;
        teamTradeCounts = null;
    }
    
    function togglePlay() {
        if(tl.progress() == 1) {
            tl.restart();
        } else {
            if(tl.paused()) {
                tl.resume();
                $('#animation-area').removeClass('paused finished').addClass('playing');
            } else {
                tl.pause();
                $('#animation-area').removeClass('playing finished').addClass('paused');
            }
        }
    }
    
    function onTlStart() {
        $('#animation-area').removeClass('paused finished').addClass('playing');
        $centerMessage.text('').removeClass('show');
    }
    
    function onTlUpdate() {
        scrubBar.tlSetTo(tl.progress());
    }
    
    function onTlComplete() {
        $('#animation-area').removeClass('paused playing').addClass('finished');
    }
    
    function cloneObj(obj) {
        return $.extend(true, {}, obj);
    }
    
    // Takes a mydql date string (YYYY-MM-DD) and returns a date object
    function dateObjFromMysqlStr(dateStr) {
        var pieces = dateStr.split('-'),
            year = parseInt(pieces[0]),
            month = parseInt(pieces[1]) - 1,
            day = parseInt(pieces[2]);
        return new Date(year, month, day);
    }
    
    // Takes a js date object and returns a human-readable string (e.g. Jun 8, 1983)
    function dateStrFromObj(dateObj) {
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[dateObj.getMonth()] + ' ' + dateObj.getDate() + ', ' + dateObj.getFullYear();
    }
    
    // Takes a date object and returns a mysql-type string. Defaults to today (in user's timezone)
    function mysqlDateStrFromObj(dateObj) {
        if(dateObj === undefined) dateObj = new Date();
        var dd = dateObj.getDate(),
            mm = dateObj.getMonth() + 1,
            yyyy = dateObj.getFullYear();
        if(dd < 10) dd = '0' + dd;
        if(mm < 10) mm = '0' + mm;
        return yyyy + '-' + mm + '-' + dd;
    }
    
    // takes a trade object, returns that trade's line ID corresponding to array generating in PHP
    function getLineIndex(trade) {
        var team0 = trade.team0,
            team1 = trade.team1,
            lineIndex = 0;
        for(var i=1; i<team0; ++i) {
            lineIndex += 31 - i;
        }
        lineIndex += team1 - team0 - 1;
        return lineIndex;
    }
    
    function newFilledArray(length, val) {
        var array = [],
            i = 0;
        while (i < length) {
            array[i++] = val;
        }
        return array;
    }
    
    // CSS keeps #circle no wider than the viewport; this restricts the vertical dimension
    function resizeCircle() {
        var parentWidthPx = document.getElementById('animation-area').offsetWidth,
            windowHeight =  window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight,
            heightBuffer = 40;
        if(parentWidthPx + heightBuffer > windowHeight) {
            var targetPerc = 100 * (windowHeight - heightBuffer) / parentWidthPx;
            document.getElementById('circle-container').style.width = targetPerc+'%';
        } else {
            document.getElementById('circle-container').style.width = '100%';
        }
    }
    
    // Public functions
    return {
        init: function(linesArrFromPHP) {
            lines = linesArrFromPHP;
            linesCount = lines.length;
            // Save all background lines to array for easier retrieval
            for(i=0; i<linesCount; ++i) {
                bgLines[i] = document.getElementById('bg-line-'+i);
                bgLines[i].style.opacity = 0;
            }
            triggerUpdate();
        },
        addTrade: function(trade) {
            trades.push(trade);
        }
    };
    
})();