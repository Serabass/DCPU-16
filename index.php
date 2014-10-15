<!DOCTYPE HTML>
<html>
<head>
    <title>DCPU-16 emulator</title>
    <meta name="viewport" content="width = 1300">
    <link rel="stylesheet" href="css/dcpu.css?<?=rand()?>">
    <script type="text/javascript" src="js/common.js?v=1"></script>
    <script type="text/javascript" src="js/assembler.js?v=5"></script>
    <script type="text/javascript" src="js/disassembler.js?v=3"></script>
    <script type="text/javascript" src="js/emulator.js?v=2"></script>
    <script type="text/javascript" src="js/clock.js?v=1"></script>
    <script type="text/javascript" src="js/screen.js?v=1"></script>
    <script type="text/javascript" src="js/keyboard.js?v=1"></script>
    <script type="text/javascript" src="/jquery.js?v=1"></script>

    <script type="text/javascript" src="/physicsjs/physicsjs-full-0.6.0.js?v=1"></script>
    <script type="text/javascript" src="/main.js?<?=rand()?>"></script>

    <script type="text/javascript">
        // http://stackoverflow.com/questions/9531214/access-individual-bits-in-a-char-c
        $(function () {

            setInterval(function () {
                $('.processor .bit').each(function (i) {
                    var address = $(this).parents('.processor').data('address');
                    address = parseInt(address, 16)
                    var bit = (memory[address] >> (i % 16)) & 0x01;
                    if (bit == 1) {
                        $(this).addClass('hl');
                    } else {
                        $(this).removeClass('hl');
                    }
                });
            }, 50);

            $(document).on('click', '.processor .bit', function () {
                var address = $(this).parents('.processor').data('address');
                address = parseInt(address, 16)
                $(this).toggleClass('hl');
                var has = $(this).hasClass('hl');
                var index = parseInt($(this).data('bitindex'), 10);
                if (has) {
                    memory[address] |= (1 << index);
                } else {
                    memory[address] &= ~(1 << index);
                }
            });

        });

    </script>
</head>
<body spellcheck="false" onresize="updateSizes()" onload="updateSizes()">
<div id="controls" class="fl_r">
    <button onclick="run(this)" id="button_run" class="big green">&#8595; Run (F5)</button>
    <button onclick="step()"  class="big">&#8618; Step (F6)</button>
    <button onclick="reset()" class="big">&#8634; Reset (Esc)</button>
</div>
<div id="cycles_wrap" class="editor fl_r"><div class="reg_name fl_l">Cycles:</div><div id="cycles" class="reg_value fl_l">0</div></div>
<div id="header">
    <h3>DCPU-16 Assembler, Emulator &amp; Disassembler<span class="notice">by deNULL. In case of problems, write at <a href="mailto:me@denull.ru">me@denull.ru</a> or use <a href="/old/">the old version</a>.</span></h3>
    <div class="tabs">
        <a href="javascript:" onclick="toggleTab(0)" class="tab_active" id="tab0">Assembler</a>
        <a href="javascript:" onclick="toggleTab(1)" class="tab_inactive" id="tab1">Disassembler</a>
    </div>
</div>
<div id="info_panel" class="fl_r">
    <div id="screen_wrapper">
        <canvas id="screen" width="384" height="288"></canvas>
        <img id="loading_overlay" src="/img/DcNzS.png" width="384" height="288"/>
    </div>
    <h4>Registers:</h4>
    <div id="registers" class="editor">
        <div class="reg_name fl_l">PC:</div><div id="regPC" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">SP:</div><div id="regSP" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">IA:</div><div id="regIA" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">EX:</div><div id="regEX" class="reg_value fl_l">0</div>

        <div class="reg_name fl_l clear">A:</div><div id="regA" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">B:</div><div id="regB" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">C:</div><div id="regC" class="reg_value fl_l">0</div>

        <div class="reg_name fl_l clear">X:</div><div id="regX" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">Y:</div><div id="regY" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">Z:</div><div id="regZ" class="reg_value fl_l">0</div>

        <div class="reg_name fl_l clear">I:</div><div id="regI" class="reg_value fl_l">0</div>
        <div class="reg_name fl_l">J:</div><div id="regJ" class="reg_value fl_l">0</div>
    </div>
    <div style="clear: both"></div>
    <button onclick="disassembleDump()" id="disassemble_dump">Disassemble</button>
    <h4>Memory dump:</h4>
    <div id="memory_wrapper" onscroll="updateMemoryView()">
        <div id="memory_content">
            <div id="memory_lines" class="editor fl_l"></div>
            <div id="memory_view" class="editor fl_l"></div>
        </div>
    </div>
</div>
<div id="tab0_content">
    <div id="asm_lines_wrap" class="column fl_l">
        <div class="editor" id="asm_lines"></div>
    </div>
    <div id="asm_dump_wrap" class="column fl_r">
        <div class="editor" id="asm_dump"></div>
    </div>
    <div class="column fl_r">
        <div class="editor" id="asm_offsets"></div>
    </div>
    <div class="column">
        <div class="line_highlight" id="asm_hlight"></div>
        <div class="editor" id="asm_code" wrap="off" spellcheck="false" onkeyup="assemble()" onkeydown="assemble()" onselect="assemble()" onkeypress="assemble()" onmouseup="assemble()" onchange="assemble()" contentEditable="true" autocomplete="off">
            <?php
            $default_code =file_get_contents('samplecode.asm');
            $code = $default_code;
            if (isset($_REQUEST['code'])) {
                $code = $_REQUEST['code'];
            }
            $code = htmlspecialchars($code);
            $code = "<div>".str_replace(array(" ", "\n"), array("&nbsp;", "</div><div>"), $code)."</div>";
            $code = str_replace("<div></div>", "<div><br/></div>", $code);
            echo $code;
            ?>
        </div>
    </div>
</div>
<div id="tab1_content">
    <div id="dasm_lines_wrap" class="column fl_l">
        <div class="editor" id="dasm_lines"></div>
    </div>
    <div class="column fl_r">
        <div class="editor" id="dasm_offsets"></div>
    </div>
    <div id="dasm_code_wrap" class="column fl_r">
        <div class="editor" id="dasm_code"></div>
    </div>
    <div class="editor" id="dasm_dump" wrap="off" spellcheck="false" onkeyup="disassemble()" onkeydown="disassemble()" onselect="disassemble()" onkeypress="disassemble()" onmouseup="disassemble()" onchange="disassemble()" contentEditable="true" autocomplete="off"></div>
</div>
<div class="canvas">
    <canvas id="canvas"></canvas>
</div>

<div class="processors">
    <div class="processor" data-address="0x5000">
        <?php for($i = 0; $i < 8; $i++) : ?>
            <div class="bit" data-bitindex="<?=$i?>"><?=$i?></div>
        <?php endfor; ?>
        <div class="clear"></div>
        <?php for($i = 8; $i < 16; $i++) : ?>
            <div class="bit" data-bitindex="<?=$i?>"><?=$i?></div>
        <?php endfor; ?>
    </div>

    <div class="clear"></div>

    <div class="processor" data-address="0x5002">
        <?php for($i = 0; $i < 8; $i++) : ?>
            <div class="bit" data-bitindex="<?=$i?>"><?=$i?></div>
        <?php endfor; ?>
        <div class="clear"></div>
        <?php for($i = 8; $i < 16; $i++) : ?>
            <div class="bit" data-bitindex="<?=$i?>"><?=$i?></div>
        <?php endfor; ?>
    </div>
</div>
<div id="log" class="editor">

</div>
<script language="javascript" src="js/ui.js?v=1"></script>
</body>
</html>