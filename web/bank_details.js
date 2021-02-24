
const BANKS = {
   'absa bank': ('Absa Bank', 632005),
   'capitec bank': ('Capitec Bank', 470010),
   'first national bank (south africa)': ('First National Bank (South Africa)', 250655),
   'investec bank': ('Investec Bank', 580105),
   'nedbank (south africa)': ('Nedbank (South Africa)', 198765),
   'nedbank corporate saver account': ('Nedbank Corporate Saver Account', 720026),
   'postbank': ('Postbank', 460005),
   'standard bank (south africa)': ('Standard Bank (South Africa)', 51001),
   'african bank': ('African Bank', 430000),
   'albaraka bank': ('Albaraka Bank', 800000),
   'bank of namibia': ('Bank Of Namibia', 980172),
   'bidvest bank': ('Bidvest Bank', 462005),
   'central bank of lesotho': ('Central Bank Of Lesotho', 586611),
   'citi bank': ('Citi Bank', 350005),
   'finbond mutual bank': ('Finbond Mutual Bank', 589000),
   'first national bank lesotho': ('First National Bank Lesotho', 280061),
   'first national bank namibia': ('First National Bank Namibia', 282672),
   'first national bank swaziland': ('First National Bank Swaziland', 287364),
   'grinrod bank': ('Grinrod Bank', 584000),
   'hsbc bank': ('Hsbc Bank', 587000),
   'jp morgan chase bank': ('Jp Morgan Chase Bank', 432000),
   'meeg bank': ('Meeg Bank', 471001),
   'merchantile bank': ('Merchantile Bank', 450105),
   'mtn banking': ('Mtn Banking', 490991),
   'standard bank namibia': ('Standard Bank Namibia', 87373),
   'state bank of india': ('State Bank Of India', 801000),
   'ubank': ('Ubank', 431010),
   'unibank': ('Unibank', 790005),
   'vbs mutual bank': ('Vbs Mutual Bank', 588000)
}

function save_bank_data()
{
    var preMessage = 'You have errors:<br><br>'
    var inputs = $("form").find("input");
    var errors = [];

    $("#error").html("");

    if (!inputs[0].value) {
        errors.push("<a href='#name-input'><i class='icon-up'></i> Please provide your name.</a>");
        $("#name-input").addClass('error');
    }
    if (!inputs[1].value) {
        errors.push("<a href='#contact-number-input'><i class='icon-up'></i> Please provide your contact number.</a>");
        $("#contact-number-input").addClass('error');
    }
    if (!inputs[2].value) {
        errors.push("<a href='#address-input'><i class='icon-up'></i> Please provide your address.</a>");
        $("#address-input").addClass('error');
    }
    if (!$('#bank').val()) {
        errors.push("<a href='#bank-input'><i class='icon-up'></i> Please select your bank.</a>");
        $("#bank-input").addClass('error');
    }
    if (!$("#bank-account").val()) {
        errors.push("<a href='#bank-account-input'><i class='icon-up'></i> Please enter your bank account number.</a>");
        $("#bank-account-input").addClass('error');        
    }
    if (errors.length > 0) {
      $("#error").addClass('show');
      $("#error").html(preMessage + errors.join('<br>'))
      return false;
    }
    $("#error").removeClass('show');
    $("#progress").html("Checking your bank account...");
    var branch_code = BANKS[$("#bank").val()];
    var account_number = $("#bank-account").val();
    var account_type = "1";
    if (branch_code == "198765" || branch_code == "720026") {
        if (account_number[0] == "1") {
            branch_code = "198765";
        } else if (accont_number[0] == "2") {
            branch_code = "198765";
            account_type = "2";
        } else if (account_number[0] == "9") {
            branch_code = "720026";
            account_type = "2";
        }
    } else if (branch_code == "460005") {
        account_type = "2";
    }
    $.get(`/signup/check_bank_account?account_type=${account_type}&branch_code=${branch_code}&account_number=${account_number}`, function(arg) {
        arg = JSON.parse(arg);
        if (arg.success == "ok") {
            $("#submit-button")[0].onclick = undefined;
            $("#submit-button").click();
            // success
        } else {
            $("#error").addClass('show');
            $('#bank-account-input').addClass('error');
            $("#error").html("<a href='#bank-account-input'><i class='icon-up'></i>Please enter a valid bank account number.</a>");
        }
    });
    return false;
}

$(document).ready(function () {
    const urlParams = new URLSearchParams(window.location.search);
    $("#name").val(urlParams.get('name'));
    $("#contact-number").val(urlParams.get('contact-number'));
    $("#member_id").val(urlParams.get('member_id'));
    $("#price").html(urlParams.get('price'));
    $("#price-value").html(urlParams.get('price'));
    $("#next-monday").html(moment(new Date(urlParams.get('next_monday') * 1000)).format("DD MMMM YYYY"));
    $("#subscription-type").html(urlParams.get('subscription_type'));

    $('#name').on('keydown', function(){
      $('#name-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $('#contact-number').on('keydown', function(){
      $('#contact-number-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $('#address').on('keydown', function(){
      $('#address-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $("#bank").on('change', function(){
      $('#bank-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $('#bank-account').on('keydown', function(){
      $('#bank-account-input').removeClass('error');
      $("#error").removeClass('show');
    })

    $("#gym_id").val(urlParams.get('gym_id'));
    do_poll("bank details");
});
