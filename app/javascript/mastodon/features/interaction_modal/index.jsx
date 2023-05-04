import PropTypes from 'prop-types';
import React from 'react';

import { FormattedMessage, defineMessages, injectIntl } from 'react-intl';

import classNames from 'classnames';

import { connect } from 'react-redux';

import { throttle, escapeRegExp } from 'lodash';

import { openModal, closeModal } from 'mastodon/actions/modal';
import api from 'mastodon/api';
import Button from 'mastodon/components/button';
import { Icon }  from 'mastodon/components/icon';
import { registrationsOpen } from 'mastodon/initial_state';

const messages = defineMessages({
  loginPrompt: { id: 'interaction_modal.login.prompt', defaultMessage: 'Domain of your home server, e.g. mastodon.social' },
});

const mapStateToProps = (state, { accountId }) => ({
  displayNameHtml: state.getIn(['accounts', accountId, 'display_name_html']),
});

const mapDispatchToProps = (dispatch) => ({
  onSignupClick() {
    dispatch(closeModal());
    dispatch(openModal('CLOSED_REGISTRATIONS'));
  },
});

const PERSISTENCE_KEY = 'mastodon_home';

const isValidDomain = value => {
  const url = new URL('https:///path');
  url.hostname = value;
  return url.hostname === value;
};

const valueToDomain = value => {
  // If the user uses a URL to their profile page or server
  if (/^https?:\/\//.test(value)) {
    try {
      return (new URL(value)).host;
    } catch {
      return '';
    }
  // If the user writes their full handle including username
  } else if (value.includes('@')) {
    const segments = value.split('@');

    if (segments.length === 2) {
      return segments[1];
    } else {
      return '';
    }
  }

  return value;
};

class LoginForm extends React.PureComponent {

  static propTypes = {
    resourceUrl: PropTypes.string,
    intl: PropTypes.object.isRequired,
  };

  state = {
    value: localStorage ? (localStorage.getItem(PERSISTENCE_KEY) || '') : '',
    expanded: false,
    selectedOption: -1,
    isLoading: false,
    error: false,
    options: [],
  };

  setRef = c => {
    this.input = c;
  };

  handleChange = ({ target }) => {
    this.setState({ value: target.value, isLoading: true, error: false }, () => this._loadOptions());
  };

  handleSubmit = () => {
    const { value } = this.state;
    const { resourceUrl } = this.props;

    const domain = valueToDomain(value);

    if (!isValidDomain(domain)) {
      this.setState({ error: true });
      return;
    }

    if (localStorage) {
      localStorage.setItem(PERSISTENCE_KEY, domain);
    }

    const redirectUrl = new URL(`https://${domain}/.well-known/proxy?uri=${encodeURIComponent(resourceUrl)}`);
    window.location.href = redirectUrl;
  };

  handleFocus = () => {
    this.setState({ expanded: true });
  };

  handleBlur = () => {
    this.setState({ expanded: false });
  };

  handleKeyDown = (e) => {
    const { options, selectedOption } = this.state;

    switch(e.key) {
    case 'ArrowDown':
      e.preventDefault();

      if (options.length > 0) {
        this.setState({ selectedOption: Math.min(selectedOption + 1, options.length - 1) });
      }

      break;
    case 'ArrowUp':
      e.preventDefault();

      if (options.length > 0) {
        this.setState({ selectedOption: Math.max(selectedOption - 1, -1) });
      }

      break;
    case 'Enter':
      e.preventDefault();

      if (selectedOption === -1) {
        this.handleSubmit();
      } else if (options.length > 0) {
        this.setState({ value: options[selectedOption], error: false }, () => this.handleSubmit());
      }

      break;
    }
  };

  handleOptionClick = e => {
    const index  = Number(e.currentTarget.getAttribute('data-index'));
    const option = this.state.options[index];

    e.preventDefault();
    this.setState({ selectedOption: index, value: option, error: false }, () => this.handleSubmit());
  };

  _loadOptions = throttle(() => {
    const { value } = this.state;
    const domain = valueToDomain(value);

    if (domain.trim().length === 0) {
      this.setState({ options: [], isLoading: false, error: value.trim().length > 0 });
      return;
    }

    api().get('/api/v1/peers/search', { params: { q: domain } }).then(({ data }) => {
      if (!data) {
        data = [];
      }

      if (domain.includes('.') && !data.includes(domain) && isValidDomain(domain)) {
        data.unshift(domain);
      }

      this.setState({ options: data, isLoading: false });
    }).catch(() => {
      this.setState({ isLoading: false });
    });
  }, 200, { leading: true, trailing: true });

  render () {
    const { intl } = this.props;
    const { value, expanded, options, selectedOption, error } = this.state;
    const domain = valueToDomain(value).trim();
    const domainRegExp = new RegExp(`(${escapeRegExp(domain)})`, 'gi');
    const hasPopOut = domain.length > 0 && options.length > 0;

    return (
      <div className={classNames('interaction-modal__login', { focused: expanded, expanded: hasPopOut, invalid: error })}>
        <div className='interaction-modal__login__input'>
          <input
            ref={this.setRef}
            type='text'
            value={value}
            placeholder={intl.formatMessage(messages.loginPrompt)}
            aria-label={intl.formatMessage(messages.loginPrompt)}
            autoFocus
            onChange={this.handleChange}
            onFocus={this.handleFocus}
            onBlur={this.handleBlur}
            onKeyDown={this.handleKeyDown}
          />

          <Button onClick={this.handleSubmit}><FormattedMessage id='interaction_modal.login.action' defaultMessage='Take me home' /></Button>
        </div>

        {hasPopOut && (
          <div className='search__popout'>
            <div className='search__popout__menu'>
              {options.map((option, i) => (
                <button key={option} onMouseDown={this.handleOptionClick} data-index={i} className={classNames('search__popout__menu__item', { selected: selectedOption === i })}>
                  {option.split(domainRegExp).map((part, i) => (
                    part.toLowerCase() === domain.toLowerCase() ? (
                      <mark key={i}>
                        {part}
                      </mark>
                    ) : (
                      <span key={i}>
                        {part}
                      </span>
                    )
                  ))}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

}

const IntlLoginForm = injectIntl(LoginForm);

class InteractionModal extends React.PureComponent {

  static propTypes = {
    displayNameHtml: PropTypes.string,
    url: PropTypes.string,
    type: PropTypes.oneOf(['reply', 'reblog', 'favourite', 'follow']),
    onSignupClick: PropTypes.func.isRequired,
  };

  handleSignupClick = () => {
    this.props.onSignupClick();
  };

  render () {
    const { url, type, displayNameHtml } = this.props;

    const name = <bdi dangerouslySetInnerHTML={{ __html: displayNameHtml }} />;

    let title, actionDescription, icon;

    switch(type) {
    case 'reply':
      icon = <Icon id='reply' />;
      title = <FormattedMessage id='interaction_modal.title.reply' defaultMessage="Reply to {name}'s post" values={{ name }} />;
      actionDescription = <FormattedMessage id='interaction_modal.description.reply' defaultMessage='With an account on Mastodon, you can respond to this post.' />;
      break;
    case 'reblog':
      icon = <Icon id='retweet' />;
      title = <FormattedMessage id='interaction_modal.title.reblog' defaultMessage="Boost {name}'s post" values={{ name }} />;
      actionDescription = <FormattedMessage id='interaction_modal.description.reblog' defaultMessage='With an account on Mastodon, you can boost this post to share it with your own followers.' />;
      break;
    case 'favourite':
      icon = <Icon id='star' />;
      title = <FormattedMessage id='interaction_modal.title.favourite' defaultMessage="Favourite {name}'s post" values={{ name }} />;
      actionDescription = <FormattedMessage id='interaction_modal.description.favourite' defaultMessage='With an account on Mastodon, you can favourite this post to let the author know you appreciate it and save it for later.' />;
      break;
    case 'follow':
      icon = <Icon id='user-plus' />;
      title = <FormattedMessage id='interaction_modal.title.follow' defaultMessage='Follow {name}' values={{ name }} />;
      actionDescription = <FormattedMessage id='interaction_modal.description.follow' defaultMessage='With an account on Mastodon, you can follow {name} to receive their posts in your home feed.' values={{ name }} />;
      break;
    }

    let signupButton;

    if (registrationsOpen) {
      signupButton = (
        <a href='/auth/sign_up' className='link-button'>
          <FormattedMessage id='sign_in_banner.create_account' defaultMessage='Create account' />
        </a>
      );
    } else {
      signupButton = (
        <button className='link-button' onClick={this.handleSignupClick}>
          <FormattedMessage id='sign_in_banner.create_account' defaultMessage='Create account' />
        </button>
      );
    }

    return (
      <div className='modal-root__modal interaction-modal'>
        <div className='interaction-modal__lead'>
          <h3><span className='interaction-modal__icon'>{icon}</span> {title}</h3>
          <p>{actionDescription} <strong><FormattedMessage id='interaction_modal.sign_in' defaultMessage='You are not signed in. Where is your account hosted?' /></strong> <FormattedMessage id='interaction_modal.sign_in_hint' defaultMessage="Tip: It's the second half of your username." /></p>
        </div>

        <IntlLoginForm resourceUrl={url} />

        <p><FormattedMessage id='interaction_modal.no_account_yet' defaultMessage='Not on Mastodon?' /> {signupButton}</p>
      </div>
    );
  }

}

export default connect(mapStateToProps, mapDispatchToProps)(InteractionModal);
