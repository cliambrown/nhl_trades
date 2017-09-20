<?php
    
    // OMITTED: include page head and get list of teams and transaction types from database
    
    $cHalfWidth = 300;

    // Calculate various coordinates
    $logoCoords = [];
    $pi = pi();
    for ($i=1; $i<=31; ++$i) {
        $angle = $pi/2 - ($i * 2 * $pi / 31);
        $logoCoords[$i] = [];
        $logoCoords[$i]['x'] = $cHalfWidth * (1 + cos($angle));
        $logoCoords[$i]['y'] = $cHalfWidth * (1 - sin($angle));
    }
    
    $lines = [];
    
    for ($team0=1; $team0<=30; ++$team0) {
        for ($team1=$team0+1; $team1<=31; ++$team1) {
            
            $teamDist = $team1 - $team0;
            if ($teamDist > 15) $teamDist = 31 - $teamDist;
            $controlOffset = (-8/145) * $teamDist + (124/145); // Weird formula created by trial and error
            
            $x0 = $logoCoords[$team0]['x'];
            $y0 = $logoCoords[$team0]['y'];
            $cp1x = $cHalfWidth + ($controlOffset * ($x0 - $cHalfWidth));
            $cp1y = $cHalfWidth + ($controlOffset * ($y0 - $cHalfWidth));
            $x1 = $logoCoords[$team1]['x'];
            $y1 = $logoCoords[$team1]['y'];
            $cp2x = $cHalfWidth + ($controlOffset * ($x1 - $cHalfWidth));
            $cp2y = $cHalfWidth + ($controlOffset * ($y1 - $cHalfWidth));
            
            $line = [];
            $line['x0'] = nf($x0);
            $line['y0'] = nf($y0);
            $line['cp1x'] = nf($cp1x);
            $line['cp1y'] = nf($cp1y);
            $line['cp2x'] = nf($cp2x);
            $line['cp2y'] = nf($cp2y);
            $line['x1'] = nf($x1);
            $line['y1'] = nf($y1);
            $line['totalTrades'] = 0;
            $line['animatedTrades'] = 0;
            
            $lines[] = $line;
            
        }
    }
    
    $linesJSON = str_replace('},{', '},'.PHP_EOL.'{', json_encode($lines));
    // $inlineJS is echoed into a <script> tag at the end of <body>
    $inlineJS = "nhlTrades.init($linesJSON);";
    
    // OMITTED: get and validate URI parameters
    
?>
    
    <h1 class="content-heading center-text">NHL Trades</h1>
        
    <p class="center-text">
        An interactive visualization of all NHL trades and signings since the start of the 2005-2006 regular season.<br>
        <span class="bold">Click a logo</span> to see only that team's trades, or <span class="bold">change the options below</span>.
    </p>
    
    <div id="animation-area" class="center-text paused">
        
        <div id="circle-container">
            <div id="circle" class="show-numbers">
                <?php foreach ($teams as $id => $teamInfo) { ?>
                    <?php $selected = ($userOptions['teamID'] === $id ? 'selected' : ''); ?>
                    <div class="logo team-<?=$id;?> <?=$selected;?>" title="<?=$teamInfo['name'];?>" data-team="<?=$teamInfo['acronym'];?>" data-teamid="<?=$id;?>">
                        <div class="trade-count" id="trade-count-<?=$id;?>">0</div>
                    </div>
                <?php } ?>
                <div id="canvas-container">
                    <svg id="canvas" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 <?=2*$cHalfWidth;?> <?=2*$cHalfWidth;?>">
                        <?php foreach($lines as $k => $l) {
                            $d = "M{$l['x0']} {$l['y0']} C {$l['cp1x']} {$l['cp1y']}, {$l['cp2x']} {$l['cp2y']}, {$l['x1']} {$l['y1']}";
                            echo '<path class="bg-line" id="bg-line-'.$k.'" d="'.$d.'" />'.PHP_EOL."\t\t\t\t";
                        } ?>
                        <circle id="dot" cx="0" cy="0" r="6"/>
                    </svg>
                    <div id="loading-progress-container">
                        <div id="loading-progress"></div>
                        <button type="button" class="link-style" id="cancel-loading">cancel</button>
                    </div>
                    <div id="center-message"></div>
                </div>
            </div>
        </div>
        
        <div id="legend-wrapper">
            <div id="legend">
                <div class="inline-block">
                    <div class="legend-item type-1"><span class="legend-line"></span>Trade</div>
                    <div class="legend-item type-2"><span class="legend-line"></span>Free Agency</div>
                </div>
                <div class="inline-block">
                    <div class="legend-item type-3"><span class="legend-line"></span>Waivers</div>
                    <div class="legend-item type-4"><span class="legend-line"></span>Exp Draft</div>
                </div>
            </div>
        </div>
        
        <div id="player-controls-wrapper">
            
            <table id="player-controls">
                <tr>
                    <td id="play-cell">
                        <button type="button" id="play-pause" class="play-control-btn" title="Play or pause the animation" disabled>
                            <span class="play"><i class="fa fa-play" aria-hidden="true"></i></span>
                            <span class="pause"><i class="fa fa-pause" aria-hidden="true"></i></span>
                            <span class="restart"><i class="fa fa-undo" aria-hidden="true"></i></span>
                        </button>
                    </td>
                    <td id="progress-cell">
                        <div id="progress-wrapper">
                            <div id="progress-background">
                                <div id="progress-bar"></div>
                            </div>
                            <div id="handle"></div>
                        </div>
                    </td>
                    <td id="goto-end-cell">
                        <button type="button" id="goto-end" class="play-control-btn" title="Skip to the end of the animation" disabled>
                            <i class="fa fa-fast-forward" aria-hidden="true"></i>
                        </button>
                    </td>
                </tr>
            </table>
            
            <div id="trade-date"></div>
            
            <div id="speed-list">
                <fieldset>
                    <div class="radiogroup">
                        <?php
                            $speeds = [0.5, 1, 2, 5];
                            foreach ($speeds as $i => $speed) {
                                $checkedStr = ($speed == 1 ? 'checked' : '');
                                echo '<input type="radio" name="anim-speed" class="anim-speed" id="anim-speed-'.$i.'" value="'.$speed.'" '.$checkedStr.'>';
                                echo '<label for="anim-speed-'.$i.'">x'.$speed.'</label>'.PHP_EOL;
                            }
                        ?>
                    </div>
                </fieldset>
            </div>
            
        </div>
        
        <div id="filter-area" class="no-white-space">
            
            <input type="hidden" id="team-id" value="<?=$userOptions['teamID'];?>">
            <input type="hidden" id="player-id" value="<?=$userOptions['playerID'];?>">
            
            <div id="player-search-area" class="filter-block p-like">
                <label for="player-name-input" class="no-margin">Filter by Player</label>
                <br>
                <div id="autocomplete-input-wrapper" class="<?=($userOptions['playerID'] ? 'has-selected' : '');?>">
                    <input type="text" name="player-name" id="player-name-input" placeholder="Player Name" maxlength="100" value="<?=$userOptions['playerName'];?>" <?=($userOptions['playerID'] ? 'disabled' : '');?>>
                    <div id="player-name-dropdown"></div>
                    <button type="button" id="player-clear-button" title="Clear player filter"><i class="fa fa-times-circle"></i></button>
                </div>
            </div>
            
            <div class="filter-block">
                
                <div class="inline-block">
                    <p>
                        <label for="start-date-picker" class="no-margin">Start Date</label><br>
                        <input type="text" name="start-date-picker" id="start-date-picker" class="datepicker" value="<?=$startDateDP;?>">
                        <input type="hidden" name="start-date" id="start-date" value="<?=$userOptions['startDate'];?>" data-defaultval="<?=$userOptions['startDate'];?>">
                    </p>
                </div>
                
                <?php
                ?>
                
                <div class="inline-block">
                    <p>
                        <label for="end-date-picker" class="no-margin">End Date</label><br>
                        <input type="text" name="end-date-picker" id="end-date-picker" class="datepicker" value="<?=$endDateDP;?>">
                        <input type="hidden" name="end-date" id="end-date" value="<?=$userOptions['endDate'];?>" data-defaultval="<?=$userOptions['endDate'];?>">
                    </p>
                </div>
                
            </div>
            
            <div id="iomode-area" class="filter-block p-like disabled">
                
                <fieldset>
                    <legend>
                        Player Gain/Loss
                        <div class="info-tooltip-container">
                            <button type="button" class="show-tooltip-button" title="Show more info about this filter">
                                <i class="fa fa-question-circle" aria-hidden="true" title="Info"></i>
                            </button>
                            <div class="info-tooltip">
                                Show only transactions where a team gains or loses a player.<br>
                                <span class="bold">Note:</span> Only applies when a single team is selected.
                            </div>
                        </div>
                    </legend>
                    <div class="radiogroup">
                        <?php
                            $ioModes = ['all', 'gain', 'loss'];
                            foreach ($ioModes as $ioMode) {
                                $checked = ($ioMode === $userOptions['ioMode'] ? 'checked' : '');
                                echo '<input type="radio" name="iomode" id="iomode-'.$ioMode.'" value="'.$ioMode.'" '.$checked.' />';
                                echo '<label for="iomode-'.$ioMode.'">'.ucfirst($ioMode).'</label>'.PHP_EOL;
                            }
                        ?>
                    </div>
                </fieldset>
                
            </div>
            
            <div id="trans-type-area" class="filter-block p-like">
                
                <h3>Transaction Types</h3>
                
                <?php foreach ($transactionTypes as $typeID => $typeName) { ?>
                    <?php $checked = (in_array($typeID, $userOptions['hideTypes']) ? '' : 'checked');?>
                    <input type="checkbox" class="trans-type-toggle" id="show-type-<?=$typeID;?>" value="1" name="show-type-<?=$typeID;?>" data-typeid="<?=$typeID;?>" <?=$checked;?>>
                    <label for="show-type-<?=$typeID;?>"><?=htmlspecialchars($typeName);?></label>
                <?php } ?>
                
            </div>
            
            <div class="filter-block p-like">
                <h3>&nbsp;</h3>
                <button type="button" id="load" title="Load data with selected filters applied" disabled>Load</button> &nbsp;
                <button type="button" class="cancel" id="reset-filters" title="Reset all filters to their defaults" disabled>Reset</button>
            </div>
            
        </div>
        
        <div id="other-options-area">
            
            <div class="inline-block">
                <input type="checkbox" id="do-animate" value="1" name="do-animate" <?=($userOptions['animate'] ? 'checked' : '');?>><label for="do-animate">Animations</label>
            </div>
            
            <div class="inline-block">
                <input type="checkbox" id="do-show-numbers" value="1" name="do-show-numbers" <?=($userOptions['showNumbers'] ? 'checked' : '');?>><label for="do-show-numbers">Show Numbers</label>
            </div>
            
            <div class="inline-block">
                <input type="checkbox" id="do-autoupdate" value="1" name="do-autoupdate" <?=($userOptions['autoupdate'] ? 'checked' : '');?>><label for="do-autoupdate">Auto-update</label>
                <div class="info-tooltip-container">
                    <button type="button" class="show-tooltip-button" title="Show more info about this filter">
                        <i class="fa fa-question-circle" aria-hidden="true" title="Info"></i>
                    </button>
                    <div class="info-tooltip">
                        When selected, loading begins as soon as any option is changed.
                    </div>
                </div>
            </div>
            
            <p>
                <label for="filter-permalink" class="no-margin">Link to the current set of options: &nbsp; <i class="fa fa-clone" aria-hidden="true"></i></label><br>
                <input type="text" id="filter-permalink" class="center-text" value="https://cliambrown.com/nhl_trades/" readonly>
            </p>
            
        </div>
        
    </div>
    
    <br>
    
    <p>This was built using data from Wikipedia, which only has information about NHL transactions starting in August of 2005 and seems to be missing Free Agency and Waiver moves before 2006. Some of the data was corrected using the excellent database at <a href="https://www.prosportstransactions.com/hockey/">prosportstransactions.com/hockey</a>.</p>
    
    <p>For suggestions, requests, errors, or fawning praise, please <a href="../contact/">contact me</a>.</p>
    
    <p>Technical info for the curious: I tried many different ways to animate the data, including using native HTML5 canvas, SVG, <a href="https://d3js.org/">d3</a>, the <a href="http://www.pixijs.com/">PIXI WebGL library</a>, and various combinations of all of them. No technique provided sufficiently smooth performance given the complexity of what I was trying to do, so I ended up simplifying the animation and using SVG for its built-in scalability and CSS controls.</p>
        
    <p>The animations are built using the remarkably powerful <a href="https://greensock.com/">GreenSock Animation Platform</a>. I fell in love with GSAP's ability to keep track of everything that needed to happen at specific times and its timeline feature with built-in seek abilities.</p>

<?php // OMITTED: include page footer and javascript files ?>

<?php
    function nf($num) {
        return round($num);
    }
?>